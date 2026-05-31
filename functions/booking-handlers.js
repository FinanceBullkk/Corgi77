const { queueConfirmationEmail } = require('./email-helpers');
const { minToHHmm } = require('./format-helpers');

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

function createBookRegistrationHandler({ db, Timestamp, HttpsError, assertSignedIn, addAudit, defaultMaxChanges, defaultAssessmentName, defaultBuList, userRateLimitMs }) {
  function businessError(message) {
    return new HttpsError('failed-precondition', message);
  }

  function rateLimitRef(operation, email) {
    const key = String(email).toLowerCase().replace(/[/.#[\]$]/g, '_');
    return db.doc(`functionRateLimits/${operation}_${key}`);
  }

  function assertNotRateLimited(rateSnap) {
    if (!rateSnap.exists) return;
    const lastCallAt = rateSnap.data().lastCallAt;
    const lastMs = typeof lastCallAt?.toDate === 'function' ? lastCallAt.toDate().getTime() : 0;
    if (lastMs && Date.now() - lastMs < userRateLimitMs) {
      throw new HttpsError('resource-exhausted', 'Bạn thao tác quá nhanh. Vui lòng thử lại sau vài giây.');
    }
  }

  return async function bookRegistration(request) {
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
      const userRateRef = rateLimitRef('bookRegistration', email);

      const [cfgSnap, regSnap, quotaSnap, blockSnap, claimSnap, spSnap, skSnap, rateSnap] = await Promise.all([
        tx.get(cfgRef),
        tx.get(regRef),
        tx.get(quotaRef),
        tx.get(blockRef),
        tx.get(claimRef),
        tx.get(spRef),
        tx.get(skRef),
        tx.get(userRateRef),
      ]);

      assertNotRateLimited(rateSnap);
      const cfg = cfgSnap.exists ? cfgSnap.data() : {};
      const buList = (Array.isArray(cfg.buList) && cfg.buList.length > 0)
        ? cfg.buList.map(String)
        : defaultBuList; // fallback mirrors client-side DEFAULT_BU_LIST in src/lib/db.ts
      if (!buList.includes(bu)) throw businessError('BU không hợp lệ.');
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
      if (claimSnap.exists && claimSnap.data().email !== email) throw businessError('Mã NV này đã đăng ký bằng email khác.');
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
        tx.set(userRateRef, { lastCallAt: Timestamp.now() });
        if (!claimSnap.exists) tx.set(claimRef, { email });
        return;
      }

      const savedQuota = quotaSnap.exists ? Math.max(0, quotaSnap.data().changeCount ?? 0) : null;
      const baseCount = oldReg ? Math.max(0, oldReg.changeCount ?? 0) : (savedQuota ?? 0);
      const changeCount = oldReg ? baseCount + 1 : baseCount;
      const maxChanges = typeof cfg.maxChanges === 'number' ? cfg.maxChanges : defaultMaxChanges;
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
      tx.set(userRateRef, { lastCallAt: Timestamp.now() });
      if (oldSpId !== sp.slotId) tx.update(spRef, { remaining: spAvail - 1 });
      if (oldSkId !== sk.slotId) tx.update(skRef, { remaining: skAvail - 1 });
      if (quotaSnap.exists) tx.delete(quotaRef);
      if (!claimSnap.exists) tx.set(claimRef, { email });
      if (oldClaimRef && oldClaimSnap?.exists && oldClaimSnap.data().email === email) tx.delete(oldClaimRef);

      const now = Timestamp.now();
      tx.set(regRef, {
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
        mailData = {
          fullName,
          sp,
          sk,
          isUpdate: !!oldReg,
          assessmentName: typeof cfg.assessmentName === 'string' && cfg.assessmentName.trim()
            ? cfg.assessmentName.trim()
            : defaultAssessmentName,
          empCode,
          sequence: changeCount,
        };
      }
    });

    if (auditDetail) await addAudit(email, auditDetail.prevSpeakingSlotId ? 'book.update' : 'book.create', auditDetail);
    if (mailData) {
      try {
        await queueConfirmationEmail(
          db,
          email,
          mailData.fullName,
          mailData.sp,
          mailData.sk,
          mailData.isUpdate,
          mailData.assessmentName,
          mailData.empCode,
          mailData.sequence,
        );
      } catch (e) {
        console.warn('Confirmation email failed:', e);
      }
    }
    return { ok: true, emailSent };
  }
}

module.exports = { createBookRegistrationHandler };
