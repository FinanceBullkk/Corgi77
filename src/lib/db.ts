import {
  collection,
  doc,
  getDoc,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import type { BookPayload, BookResult, CancelResult, InitResult, Slot } from './types';
import { captureError, friendlyFirestoreError } from './monitoring';

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
 * Pre-flight eligibility check by empCode. Reads /ineligibility/{empCode},
 * optional /eligibility/{empCode}, and optional /empCodeClaims/{empCode}.
 * Returns the human-readable reason if the user is blocked, or null if allowed.
 *
 * Default behaviour (empty /ineligibility collection): null = nobody blocked.
 * Server-side rules (`isNotBlocked()`) also enforce this on register write.
 *
 * Exported so the booking wizard can pre-flight at the Step 1 -> Step 2
 * transition (after user types empCode but before they pick slots).
 */
export async function checkIneligibility(empCode: string, email?: string): Promise<string | null> {
  const code = empCode.trim();
  if (!code) return null; // empty empCode will fail other validation
  const normalizedEmail = email?.trim();
  try {
    // 1. Blocklist check: /ineligibility/{empCode}
    const snap = await getDoc(doc(db, 'ineligibility', code));
    if (snap.exists()) {
      const reason = (snap.data().reason as string | undefined)?.trim();
      return reason && reason.length > 0
        ? reason
        : 'Bạn không đủ điều kiện đăng ký kỳ thi này. Vui lòng liên hệ Ban tổ chức.';
    }

    // 2. Eligibility check: /eligibility (config-gated)
    //    When requireEligibility=true, the specific /eligibility/{empCode} doc
    //    must exist. We use a single getDoc (requires 'get' permission only)
    //    instead of a collection scan (which would require 'list' permission
    //    and expose the full allowlist to any signed-in user).
    const cfgSnap = await getDoc(doc(db, 'config', 'main'));
    if (cfgSnap.exists() && cfgSnap.data().requireEligibility === true) {
      const eligDoc = await getDoc(doc(db, 'eligibility', code));
      if (!eligDoc.exists()) {
        return 'Bạn không nằm trong danh sách đủ điều kiện đăng ký. Vui lòng liên hệ BTC.';
      }
    }

    // 3. Active-registration uniqueness check: /empCodeClaims/{empCode}
    //    If the code is already held by another email, fail at Step 1 instead
    //    of waiting until final booking submit. The transaction in bookDb()
    //    remains the hard guarantee against races.
    if (normalizedEmail) {
      const claimDoc = await getDoc(doc(db, 'empCodeClaims', code));
      if (claimDoc.exists() && claimDoc.data().email !== normalizedEmail) {
        return 'Mã NV này đã đăng ký bằng email khác.';
      }
    }

    return null;
  } catch (e) {
    // Re-throw so callers can distinguish "network error" from "verified OK".
    // bookDb wraps this call in try-catch for non-blocking preflight; server rules
    // enforce on actual write regardless.
    captureError(e, { operation: 'checkIneligibility' });
    throw e;
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
  const trimmedEmpCode = empCode.trim();

  if (!trimmedEmpCode || !fullName.trim() || !bu.trim())
    return { ok: false, error: 'Vui lòng điền đầy đủ Mã NV, Họ và tên, BU.' };
  if (!/^\d{6}$/.test(trimmedEmpCode))
    return { ok: false, error: 'Mã NV phải là 6 chữ số (VD: 262010).' };

  let blockReason: string | null = null;
  try {
    blockReason = await checkIneligibility(trimmedEmpCode, email);
  } catch {
    // Network/permission error at preflight — non-blocking; callable enforces on write.
  }
  if (blockReason) return { ok: false, error: blockReason };

  try {
    const callBook = httpsCallable<Omit<BookPayload, 'email'>, { emailSent?: boolean }>(functions, 'bookRegistration');
    const res = await callBook({
      empCode: trimmedEmpCode,
      fullName: fullName.trim(),
      bu: bu.trim(),
      speakingSlotId,
      skillsSlotId,
    });
    let state: InitResult | undefined;
    try {
      state = await initDb(email);
    } catch (initErr) {
      captureError(initErr, { operation: 'bookDb.initDb.postCallable' });
    }
    return { ok: true, emailSent: res.data.emailSent === true, state };
  } catch (e) {
    captureError(e, { operation: 'bookDb.callable' });
    let state: InitResult | undefined;
    try {
      state = await initDb(email);
    } catch (initErr) {
      captureError(initErr, { operation: 'bookDb.initDb.catch' });
    }
    return { ok: false, error: friendlyFirestoreError(e), state };
  }
}

export async function cancelDb(email: string): Promise<CancelResult> {
  try {
    const callCancel = httpsCallable<Record<string, never>, Record<string, never>>(functions, 'cancelRegistration');
    await callCancel({});
    let state: InitResult | undefined;
    try {
      state = await initDb(email);
    } catch (initErr) {
      captureError(initErr, { operation: 'cancelDb.initDb.postCallable' });
    }
    return { ok: true, state };
  } catch (e) {
    captureError(e, { operation: 'cancelDb.callable' });
    return { ok: false, error: friendlyFirestoreError(e) };
  }
}
