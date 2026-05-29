import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { BookPayload, BookResult, CancelResult, InitResult, Slot } from './types';
import { auditLog } from './audit';

// ── helpers ──────────────────────────────────────────────────────────────

function minToHHmm(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function slotFromDoc(id: string, data: Record<string, any>): Slot {
  return {
    slotId: id,
    type: data.type,
    date: data.date,
    session: data.session ?? '',
    startMin: data.startMin,
    endMin: data.endMin,
    capacity: data.capacity,
    remaining: data.remaining ?? data.capacity,
    location: data.location ?? '',
    display: data.display ?? `${data.type} | ${data.date} | ${minToHHmm(data.startMin)}–${minToHHmm(data.endMin)}`,
  };
}

interface ConfigData {
  deadline: string | null;
  deadlinePassed: boolean;
  allowEnrollment: boolean;
  maxChanges: number;
  emailConfirm: boolean;
}

async function getConfig(): Promise<ConfigData> {
  const snap = await getDoc(doc(db, 'config', 'main'));
  const d = snap.exists() ? snap.data() : {};
  const deadline = d.deadline
    ? (d.deadline as Timestamp).toDate().toISOString()
    : null;
  return {
    deadline,
    // NOTE: client-side `deadlinePassed` is UX only (shows "expired" banner).
    // The real deadline enforcement happens in firestore.rules using request.time
    // — users cannot bypass by changing their system clock.
    deadlinePassed: deadline ? new Date() > new Date(deadline) : false,
    allowEnrollment: d.allowEnrollment !== false,
    maxChanges: typeof d.maxChanges === 'number' ? d.maxChanges : 3,
    emailConfirm: d.emailConfirm === true,
  };
}

async function getSlots(): Promise<Slot[]> {
  const snap = await getDocs(collection(db, 'slots'));
  const slots = snap.docs.map((d) => slotFromDoc(d.id, d.data()));
  slots.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.startMin - b.startMin;
  });
  return slots;
}

async function getMyBooking(email: string) {
  if (!email) return null;
  const snap = await getDoc(doc(db, 'registrations', email));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    empCode: d.empCode ?? '',
    fullName: d.fullName ?? '',
    bu: d.bu ?? '',
    speakingSlotId: d.speakingSlotId ?? null,
    skillsSlotId: d.skillsSlotId ?? null,
    createdAt: d.createdAt ? (d.createdAt as Timestamp).toDate().toISOString() : null,
    updatedAt: d.updatedAt ? (d.updatedAt as Timestamp).toDate().toISOString() : null,
    changeCount: d.changeCount ?? 0,
  };
}

/**
 * Blocklist check by empCode. Reads /ineligibility/{empCode}.
 * Returns the human-readable reason if the user is blocked, or null if allowed.
 *
 * Default behaviour (empty /ineligibility collection): null = nobody blocked.
 * Server-side rules (`isNotBlocked()`) also enforce this on register write.
 *
 * Exported so the booking wizard can pre-flight at the Step 1 → Step 2
 * transition (after user types empCode but before they pick slots).
 */
export async function checkIneligibility(empCode: string): Promise<string | null> {
  const code = empCode.trim();
  if (!code) return null; // empty empCode will fail other validation
  try {
    // 1. Blocklist check: /ineligibility/{empCode}
    const snap = await getDoc(doc(db, 'ineligibility', code));
    if (snap.exists()) {
      const reason = (snap.data().reason as string | undefined)?.trim();
      return reason && reason.length > 0
        ? reason
        : 'Bạn không đủ điều kiện đăng ký kỳ thi này. Vui lòng liên hệ Ban tổ chức.';
    }

    // 2. Eligibility check: /eligibility (config-gated, backward-compatible)
    //    If requireEligibility=true but /eligibility collection is empty → allow all
    const cfgSnap = await getDoc(doc(db, 'config', 'main'));
    if (cfgSnap.exists() && cfgSnap.data().requireEligibility === true) {
      const eligCol = collection(db, 'eligibility');
      const anyDoc = await getDocs(query(eligCol, limit(1)));
      if (!anyDoc.empty) {
        // Collection has data → enforce eligibility per user
        const eligDoc = await getDoc(doc(db, 'eligibility', code));
        if (!eligDoc.exists()) {
          return 'Bạn không nằm trong danh sách đủ điều kiện đăng ký. Vui lòng liên hệ BTC.';
        }
      }
    }

    return null;
  } catch (e) {
    // If read fails (network, permission), don't block the user here —
    // server-side rules will still enforce on actual write.
    console.warn('checkIneligibility read failed (non-blocking):', e);
    return null;
  }
}

// Fire-and-forget confirmation email via /mail (Firebase Send-Email extension).
// Non-blocking: failures are logged but never thrown.
async function sendConfirmationEmail(
  email: string,
  fullName: string,
  sp: Slot,
  sk: Slot,
  isUpdate: boolean
): Promise<void> {
  try {
    const fmtSlot = (s: Slot) => {
      const [y, mo, d] = s.date.split('-');
      return `${d}/${mo}/${y} · ${minToHHmm(s.startMin)}–${minToHHmm(s.endMin)}${s.location ? ' · ' + s.location : ''}`;
    };
    const verb = isUpdate ? 'cập nhật' : 'đăng ký';
    await addDoc(collection(db, 'mail'), {
      to: email,
      message: {
        subject: `[Assessment Q2 2026] Xác nhận ${verb} ca thi`,
        html: `
          <p>Xin chào <b>${fullName}</b>,</p>
          <p>Bạn đã ${verb} thành công 2 ca thi Assessment Q2 2026:</p>
          <ul>
            <li><b>Speaking:</b> ${fmtSlot(sp)}</li>
            <li><b>3 Skills:</b> ${fmtSlot(sk)}</li>
          </ul>
          <p>Nếu cần đổi/huỷ, vui lòng truy cập lại hệ thống trước thời hạn.</p>
          <p>— Ban tổ chức Assessment</p>
        `,
      },
    });
  } catch (e) {
    console.warn('Confirmation email failed (non-blocking):', e);
  }
}

// ── public API ───────────────────────────────────────────────────────────

export async function initDb(email: string): Promise<InitResult> {
  const [cfg, slots, myBooking] = await Promise.all([
    getConfig(),
    getSlots(),
    getMyBooking(email),
  ]);
  return {
    email,
    myBooking,
    slots,
    deadline: cfg.deadline,
    deadlinePassed: cfg.deadlinePassed,
    allowEnrollment: cfg.allowEnrollment,
    serverNow: new Date().toISOString(),
    maxChanges: cfg.maxChanges,
  };
}

export async function bookDb(email: string, payload: Omit<BookPayload, 'email'>): Promise<BookResult> {
  const { empCode, fullName, bu, speakingSlotId, skillsSlotId } = payload;

  if (!empCode.trim() || !fullName.trim() || !bu.trim())
    return { ok: false, error: 'Vui lòng điền đầy đủ Mã NV, Họ và tên, BU.' };
  if (!/^\d{6}$/.test(empCode.trim()))
    return { ok: false, error: 'Mã NV phải là 6 chữ số (VD: 262010).' };

  // Pre-flight blocklist check by empCode (UX only — server rules enforce too).
  // We read config once outside the transaction so we can fail fast.
  let preflightCfg: ConfigData;
  try {
    preflightCfg = await getConfig();
  } catch (e) {
    return { ok: false, error: 'Không tải được cấu hình hệ thống.' };
  }
  const blockReason = await checkIneligibility(empCode);
  if (blockReason) return { ok: false, error: blockReason };

  // Tracking vars set inside transaction (transactions may retry — final values win).
  let isUpdate = false;
  let prevSpId: string | null = null;
  let prevSkId: string | null = null;
  let finalChangeCount = 0;
  let bookedSp: Slot | null = null;
  let bookedSk: Slot | null = null;

  try {
    await runTransaction(db, async (tx) => {
      // Config
      const cfgSnap = await tx.get(doc(db, 'config', 'main'));
      const cfg = cfgSnap.exists() ? cfgSnap.data() : {};
      if (cfg.allowEnrollment === false)
        throw new Error('Đăng ký hiện đang bị khoá. Vui lòng liên hệ Ban tổ chức.');
      // Client-side deadline check is for UX (clearer error message).
      // Server-side rules enforce the real deadline using request.time.
      if (cfg.deadline && new Date() > (cfg.deadline as Timestamp).toDate())
        throw new Error('Đã hết hạn đăng ký.');

      // Slots
      const spRef = doc(db, 'slots', speakingSlotId);
      const skRef = doc(db, 'slots', skillsSlotId);
      const [spSnap, skSnap] = await Promise.all([tx.get(spRef), tx.get(skRef)]);

      if (!spSnap.exists() || spSnap.data().type !== 'Speaking')
        throw new Error('Ca Speaking không hợp lệ.');
      if (!skSnap.exists() || skSnap.data().type !== '3 Skills')
        throw new Error('Ca 3 Skills không hợp lệ.');

      const sp = slotFromDoc(spSnap.id, spSnap.data());
      const sk = slotFromDoc(skSnap.id, skSnap.data());

      // Overlap
      if (sp.date === sk.date && sp.startMin < sk.endMin && sp.endMin > sk.startMin)
        throw new Error('Hai ca thi bị trùng giờ. Vui lòng chọn 2 ca không trùng.');

      // Existing registration
      const regRef = doc(db, 'registrations', email);
      const regSnap = await tx.get(regRef);
      const oldReg = regSnap.exists() ? regSnap.data() : null;
      const oldSpId: string | null = oldReg?.speakingSlotId ?? null;
      const oldSkId: string | null = oldReg?.skillsSlotId ?? null;

      // Change limit
      const changeCount = oldReg ? (oldReg.changeCount ?? 0) + 1 : 0;
      const maxChanges = typeof cfg.maxChanges === 'number' ? cfg.maxChanges : 3;
      if (oldReg && changeCount > maxChanges)
        throw new Error(`Bạn đã đổi ca ${oldReg.changeCount} lần (tối đa ${maxChanges} lần). Liên hệ Ban tổ chức.`);

      // Capacity check
      const spAvail = sp.remaining + (oldSpId === sp.slotId ? 1 : 0);
      const skAvail = sk.remaining + (oldSkId === sk.slotId ? 1 : 0);
      if (spAvail <= 0) throw new Error(`Ca Speaking "${sp.display}" đã hết chỗ.`);
      if (skAvail <= 0) throw new Error(`Ca 3 Skills "${sk.display}" đã hết chỗ.`);

      // ── ALL READS for old slots (must happen BEFORE any writes) ──
      let oldSpRemaining: number | null = null;
      let oldSkRemaining: number | null = null;
      if (oldSpId && oldSpId !== sp.slotId) {
        const oldSpSnap = await tx.get(doc(db, 'slots', oldSpId));
        if (oldSpSnap.exists()) oldSpRemaining = oldSpSnap.data().remaining ?? 0;
      }
      if (oldSkId && oldSkId !== sk.slotId) {
        const oldSkSnap = await tx.get(doc(db, 'slots', oldSkId));
        if (oldSkSnap.exists()) oldSkRemaining = oldSkSnap.data().remaining ?? 0;
      }

      // ── ALL WRITES below ──
      if (oldSpRemaining !== null && oldSpId)
        tx.update(doc(db, 'slots', oldSpId), { remaining: oldSpRemaining + 1 });
      if (oldSkRemaining !== null && oldSkId)
        tx.update(doc(db, 'slots', oldSkId), { remaining: oldSkRemaining + 1 });

      // Decrement new slot remaining
      if (oldSpId !== sp.slotId) tx.update(spRef, { remaining: spAvail - 1 });
      if (oldSkId !== sk.slotId) tx.update(skRef, { remaining: skAvail - 1 });

      // Write registration
      const now = Timestamp.now();
      tx.set(regRef, {
        email,
        empCode: empCode.trim(),
        fullName: fullName.trim(),
        bu: bu.trim(),
        speakingSlotId,
        skillsSlotId,
        createdAt: oldReg?.createdAt ?? now,
        updatedAt: now,
        changeCount,
      });

      // Capture state for post-transaction work
      isUpdate = !!oldReg;
      prevSpId = oldSpId;
      prevSkId = oldSkId;
      finalChangeCount = changeCount;
      bookedSp = sp;
      bookedSk = sk;
    });

    // ── Post-transaction side effects (non-blocking) ────────────────────
    void auditLog(email, isUpdate ? 'book.update' : 'book.create', {
      empCode: empCode.trim(),
      fullName: fullName.trim(),
      bu: bu.trim(),
      speakingSlotId,
      skillsSlotId,
      prevSpeakingSlotId: prevSpId,
      prevSkillsSlotId: prevSkId,
      changeCount: finalChangeCount,
    });

    let emailSent = false;
    if (preflightCfg.emailConfirm && bookedSp && bookedSk) {
      void sendConfirmationEmail(email, fullName.trim(), bookedSp, bookedSk, isUpdate);
      emailSent = true; // queued; actual delivery handled by Send-Email extension
    }

    // Wrap post-transaction initDb so its failure doesn't mask a successful booking
    let state: InitResult | undefined;
    try {
      state = await initDb(email);
    } catch (initErr) {
      console.warn('initDb failed after successful booking (non-blocking):', initErr);
    }
    return { ok: true, emailSent, state };
  } catch (e) {
    // Transaction itself failed — try to fetch state for UI display
    let state: InitResult | undefined;
    try {
      state = await initDb(email);
    } catch (initErr) {
      console.warn('initDb failed in catch block:', initErr);
    }
    return { ok: false, error: (e as Error).message, state };
  }
}

export async function cancelDb(email: string): Promise<CancelResult> {
  try {
    let cancelled = false;
    await runTransaction(db, async (tx) => {
      const cfgSnap = await tx.get(doc(db, 'config', 'main'));
      const cfg = cfgSnap.exists() ? cfgSnap.data() : {};
      // Client-side deadline check is UX only — rules enforce real deadline.
      if (cfg.deadline && new Date() > (cfg.deadline as Timestamp).toDate())
        throw new Error('Đã hết hạn đăng ký. Không thể hủy.');

      const regRef = doc(db, 'registrations', email);
      const regSnap = await tx.get(regRef);
      if (!regSnap.exists()) throw new Error('Bạn chưa có đăng ký nào để hủy.');

      const reg = regSnap.data();

      // ── ALL READS first ──
      let spRemaining: number | null = null;
      let skRemaining: number | null = null;
      if (reg.speakingSlotId) {
        const spSnap = await tx.get(doc(db, 'slots', reg.speakingSlotId));
        if (spSnap.exists()) spRemaining = spSnap.data().remaining ?? 0;
      }
      if (reg.skillsSlotId) {
        const skSnap = await tx.get(doc(db, 'slots', reg.skillsSlotId));
        if (skSnap.exists()) skRemaining = skSnap.data().remaining ?? 0;
      }

      // ── ALL WRITES below ──
      if (spRemaining !== null)
        tx.update(doc(db, 'slots', reg.speakingSlotId), { remaining: spRemaining + 1 });
      if (skRemaining !== null)
        tx.update(doc(db, 'slots', reg.skillsSlotId), { remaining: skRemaining + 1 });

      tx.delete(regRef);
      cancelled = true;
    });

    if (cancelled) {
      void auditLog(email, 'book.cancel', {});
    }

    let state: InitResult | undefined;
    try {
      state = await initDb(email);
    } catch (initErr) {
      console.warn('initDb failed after successful cancel (non-blocking):', initErr);
    }
    return { ok: true, state };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
