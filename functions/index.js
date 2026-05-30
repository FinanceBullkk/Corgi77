const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

initializeApp();

const db = getFirestore();

function minToHHmm(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function escHtml(s) {
  const amp = '&' + 'amp;';
  const lt = '&' + 'lt;';
  const gt = '&' + 'gt;';
  const quot = '&' + 'quot;';
  const apos = '&' + '#39;';
  return String(s)
    .replace(/&/g, amp)
    .replace(/</g, lt)
    .replace(/>/g, gt)
    .replace(/"/g, quot)
    .replace(/'/g, apos);
}

function slotFromSnap(snap) {
  const data = snap.data();
  return {
    slotId: snap.id,
    type: data.type,
    date: data.date,
    session: data.session || '',
    startMin: data.startMin,
    endMin: data.endMin,
    capacity: data.capacity,
    remaining: data.remaining ?? data.capacity,
    location: data.location || '',
    display: data.display || `${data.type} | ${data.date} | ${minToHHmm(data.startMin)}-${minToHHmm(data.endMin)}`,
  };
}

function assertSignedIn(request) {
  const email = request.auth?.token?.email;
  if (!email) throw new HttpsError('unauthenticated', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  return String(email);
}

function businessError(message) {
  return new HttpsError('failed-precondition', message);
}

async function assertAdmin(request) {
  const email = assertSignedIn(request).toLowerCase();
  const cfgSnap = await db.doc('config/main').get();
  const adminEmails = cfgSnap.exists ? (cfgSnap.data().adminEmails || []) : [];
  if (adminEmails.map((e) => String(e).toLowerCase()).includes(email)) return email;
  throw new HttpsError('permission-denied', 'Bạn không có quyền admin.');
}

async function addAudit(email, event, detail = {}) {
  try {
    await db.collection('auditLogs').add({
      timestamp: Timestamp.now(),
      email,
      event,
      detail,
    });
  } catch (e) {
    console.warn('Audit log failed:', e);
  }
}

async function queueConfirmationEmail(email, fullName, sp, sk, isUpdate) {
  const fmtSlot = (s) => {
    const [, mo, d] = s.date.split('-');
    return `${d}/${mo} · ${minToHHmm(s.startMin)}-${minToHHmm(s.endMin)}${s.location ? ' · ' + escHtml(s.location) : ''}`;
  };
  const verb = isUpdate ? 'cập nhật' : 'đăng ký';
  await db.collection('mail').add({
    to: email,
    message: {
      subject: `[Assessment Q2 2026] Xác nhận ${verb} ca thi`,
      html: `
        <p>Xin chào <b>${escHtml(fullName)}</b>,</p>
        <p>Bạn đã ${verb} thành công 2 ca thi Assessment Q2 2026:</p>
        <ul>
          <li><b>Speaking:</b> ${fmtSlot(sp)}</li>
          <li><b>3 Skills:</b> ${fmtSlot(sk)}</li>
        </ul>
        <p>Nếu cần đổi/huỷ, vui lòng truy cập lại hệ thống trước thời hạn.</p>
        <p>- Ban tổ chức Assessment</p>
      `,
    },
  });
}

async function repairClaims() {
  const regsSnap = await db.collection('registrations').get();
  const byCode = new Map();
  regsSnap.forEach((doc) => {
    const reg = doc.data();
    if (!/^\d{6}$/.test(String(reg.empCode || ''))) return;
    const arr = byCode.get(reg.empCode) || [];
    arr.push({ email: doc.id, ...reg });
    byCode.set(reg.empCode, arr);
  });

  const result = { created: 0, kept: 0, skippedDuplicates: [], conflicts: [] };
  for (const [empCode, regs] of byCode) {
    if (regs.length > 1) {
      result.skippedDuplicates.push({ empCode, emails: regs.map((r) => r.email) });
      continue;
    }
    const registrationEmail = regs[0].email;
    const claimRef = db.doc(`empCodeClaims/${empCode}`);
    const claimSnap = await claimRef.get();
    if (claimSnap.exists) {
      const claimEmail = claimSnap.data().email;
      if (claimEmail === registrationEmail) result.kept += 1;
      else result.conflicts.push({ empCode, claimEmail, registrationEmail });
      continue;
    }
    await claimRef.set({ email: registrationEmail });
    result.created += 1;
  }
  return result;
}

exports.bookRegistration = onCall(async (request) => {
  const email = assertSignedIn(request);
  const payload = request.data || {};
  const empCode = String(payload.empCode || '').trim();
  const fullName = String(payload.fullName || '').trim();
  const bu = String(payload.bu || '').trim();
  const speakingSlotId = String(payload.speakingSlotId || '').trim();
  const skillsSlotId = String(payload.skillsSlotId || '').trim();

  if (!empCode || !fullName || !bu) throw businessError('Vui lòng điền đầy đủ Mã NV, Họ và tên, BU.');
  if (!/^\d{6}$/.test(empCode)) throw businessError('Mã NV phải là 6 chữ số (VD: 262010).');
  if (!speakingSlotId || !skillsSlotId) throw businessError('Vui lòng chọn đủ 2 ca thi.');

  let emailSent = false;
  let auditDetail = null;
  let mailData = null;

  await db.runTransaction(async (tx) => {
    const cfgRef = db.doc('config/main');
    const regRef = db.doc(`registrations/${email}`);
    const quotaRef = db.doc(`cancelledQuota/${email}`);
    const blockRef = db.doc(`ineligibility/${empCode}`);
    const claimRef = db.doc(`empCodeClaims/${empCode}`);
    const spRef = db.doc(`slots/${speakingSlotId}`);
    const skRef = db.doc(`slots/${skillsSlotId}`);

    const [cfgSnap, regSnap, quotaSnap, blockSnap, claimSnap, spSnap, skSnap] = await Promise.all([
      tx.get(cfgRef),
      tx.get(regRef),
      tx.get(quotaRef),
      tx.get(blockRef),
      tx.get(claimRef),
      tx.get(spRef),
      tx.get(skRef),
    ]);

    const cfg = cfgSnap.exists ? cfgSnap.data() : {};
    if (cfg.allowEnrollment === false) throw businessError('Đăng ký hiện đang bị khoá. Vui lòng liên hệ Ban tổ chức.');
    if (cfg.deadline && Date.now() > cfg.deadline.toDate().getTime()) throw businessError('Đã hết hạn đăng ký.');
    if (blockSnap.exists) {
      const reason = String(blockSnap.data().reason || '').trim();
      throw businessError(reason || 'Bạn không đủ điều kiện đăng ký kỳ thi này. Vui lòng liên hệ Ban tổ chức.');
    }
    if (cfg.requireEligibility === true) {
      const eligSnap = await tx.get(db.doc(`eligibility/${empCode}`));
      if (!eligSnap.exists) throw businessError('Bạn không nằm trong danh sách đủ điều kiện đăng ký. Vui lòng liên hệ BTC.');
    }
    if (claimSnap.exists && claimSnap.data().email !== email) {
      throw businessError('Mã NV này đã đăng ký bằng email khác.');
    }
    if (!spSnap.exists || spSnap.data().type !== 'Speaking') throw businessError('Ca Speaking không hợp lệ.');
    if (!skSnap.exists || skSnap.data().type !== '3 Skills') throw businessError('Ca 3 Skills không hợp lệ.');

    const sp = slotFromSnap(spSnap);
    const sk = slotFromSnap(skSnap);
    if (sp.date === sk.date && sp.startMin < sk.endMin && sp.endMin > sk.startMin) {
      throw businessError('Hai ca thi bị trùng giờ. Vui lòng chọn 2 ca không trùng.');
    }

    const oldReg = regSnap.exists ? regSnap.data() : null;
    const oldSpId = oldReg?.speakingSlotId || null;
    const oldSkId = oldReg?.skillsSlotId || null;
    const oldEmpCode = typeof oldReg?.empCode === 'string' ? oldReg.empCode : null;

    if (oldReg && oldEmpCode === empCode && oldSpId === speakingSlotId && oldSkId === skillsSlotId) {
      if (!claimSnap.exists) tx.set(claimRef, { email });
      return;
    }

    const savedQuota = quotaSnap.exists ? Math.max(0, quotaSnap.data().changeCount ?? 0) : null;
    const baseCount = oldReg ? Math.max(0, oldReg.changeCount ?? 0) : (savedQuota ?? 0);
    const changeCount = oldReg ? baseCount + 1 : baseCount;
    const maxChanges = typeof cfg.maxChanges === 'number' ? cfg.maxChanges : 3;
    if (oldReg && changeCount > maxChanges) {
      throw businessError(`Bạn đã đổi ca ${baseCount} lần (tối đa ${maxChanges} lần). Liên hệ Ban tổ chức.`);
    }

    const spAvail = sp.remaining + (oldSpId === sp.slotId ? 1 : 0);
    const skAvail = sk.remaining + (oldSkId === sk.slotId ? 1 : 0);
    if (spAvail <= 0) throw businessError(`Ca Speaking "${sp.display}" đã hết chỗ.`);
    if (skAvail <= 0) throw businessError(`Ca 3 Skills "${sk.display}" đã hết chỗ.`);

    let oldSpSnap = null;
    let oldSkSnap = null;
    let oldClaimSnap = null;
    const oldClaimRef = oldEmpCode && oldEmpCode !== empCode ? db.doc(`empCodeClaims/${oldEmpCode}`) : null;
    if (oldSpId && oldSpId !== sp.slotId) oldSpSnap = await tx.get(db.doc(`slots/${oldSpId}`));
    if (oldSkId && oldSkId !== sk.slotId) oldSkSnap = await tx.get(db.doc(`slots/${oldSkId}`));
    if (oldClaimRef) oldClaimSnap = await tx.get(oldClaimRef);

    if (oldSpSnap?.exists) tx.update(oldSpSnap.ref, { remaining: (oldSpSnap.data().remaining ?? 0) + 1 });
    if (oldSkSnap?.exists) tx.update(oldSkSnap.ref, { remaining: (oldSkSnap.data().remaining ?? 0) + 1 });
    if (oldSpId !== sp.slotId) tx.update(spRef, { remaining: spAvail - 1 });
    if (oldSkId !== sk.slotId) tx.update(skRef, { remaining: skAvail - 1 });
    if (quotaSnap.exists) tx.delete(quotaRef);
    if (!claimSnap.exists) tx.set(claimRef, { email });
    if (oldClaimRef && oldClaimSnap?.exists && oldClaimSnap.data().email === email) tx.delete(oldClaimRef);

    const now = Timestamp.now();
    tx.set(regRef, {
      email,
      empCode,
      fullName,
      bu,
      speakingSlotId,
      skillsSlotId,
      createdAt: oldReg?.createdAt || now,
      updatedAt: now,
      changeCount,
    });

    auditDetail = {
      empCode,
      fullName,
      bu,
      speakingSlotId,
      skillsSlotId,
      prevSpeakingSlotId: oldSpId,
      prevSkillsSlotId: oldSkId,
      changeCount,
    };
    if (cfg.emailConfirm === true) {
      emailSent = true;
      mailData = { fullName, sp, sk, isUpdate: !!oldReg };
    }
  });

  if (auditDetail) await addAudit(email, auditDetail.prevSpeakingSlotId ? 'book.update' : 'book.create', auditDetail);
  if (mailData) {
    try {
      await queueConfirmationEmail(email, mailData.fullName, mailData.sp, mailData.sk, mailData.isUpdate);
    } catch (e) {
      console.warn('Confirmation email failed:', e);
    }
  }
  return { ok: true, emailSent };
});

exports.cancelRegistration = onCall(async (request) => {
  const email = assertSignedIn(request);

  await db.runTransaction(async (tx) => {
    const cfgSnap = await tx.get(db.doc('config/main'));
    const cfg = cfgSnap.exists ? cfgSnap.data() : {};
    if (cfg.allowEnrollment === false) throw businessError('Đăng ký hiện đang bị khoá. Vui lòng liên hệ Ban tổ chức.');
    if (cfg.deadline && Date.now() > cfg.deadline.toDate().getTime()) throw businessError('Đã hết hạn đăng ký. Không thể hủy.');

    const regRef = db.doc(`registrations/${email}`);
    const regSnap = await tx.get(regRef);
    if (!regSnap.exists) throw businessError('Bạn chưa có đăng ký nào để hủy.');
    const reg = regSnap.data();

    const spSnap = reg.speakingSlotId ? await tx.get(db.doc(`slots/${reg.speakingSlotId}`)) : null;
    const skSnap = reg.skillsSlotId ? await tx.get(db.doc(`slots/${reg.skillsSlotId}`)) : null;
    const claimRef = typeof reg.empCode === 'string' ? db.doc(`empCodeClaims/${reg.empCode}`) : null;
    const claimSnap = claimRef ? await tx.get(claimRef) : null;

    if (spSnap?.exists) tx.update(spSnap.ref, { remaining: (spSnap.data().remaining ?? 0) + 1 });
    if (skSnap?.exists) tx.update(skSnap.ref, { remaining: (skSnap.data().remaining ?? 0) + 1 });
    tx.delete(regRef);
    if (claimRef && claimSnap?.exists && claimSnap.data().email === email) tx.delete(claimRef);
    tx.set(db.doc(`cancelledQuota/${email}`), {
      changeCount: reg.changeCount ?? 0,
      cancelledAt: Timestamp.now(),
    });
  });

  await addAudit(email, 'book.cancel', {});
  return { ok: true };
});

exports.repairEmpCodeClaimsNow = onCall(async (request) => {
  const email = await assertAdmin(request);
  const result = await repairClaims();
  await addAudit(email, 'admin.backfillEmpCodeClaims', result);
  return result;
});

exports.scheduledRepairEmpCodeClaims = onSchedule('every 5 minutes', async () => {
  const result = await repairClaims();
  if (result.skippedDuplicates.length || result.conflicts.length) {
    await addAudit('system', 'admin.backfillEmpCodeClaims', result);
  }
});
