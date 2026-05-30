import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  deleteField,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import type { MyBooking, Slot } from './types';
import { auditLog } from './audit';

export interface Registration extends MyBooking {
  email: string;
}

export interface BackfillEmpCodeClaimsResult {
  created: number;
  kept: number;
  skippedDuplicates: Array<{ empCode: string; emails: string[] }>;
  conflicts: Array<{ empCode: string; claimEmail: string; registrationEmail: string }>;
}

/**
 * Entry in /ineligibility/{empCode}. Document ID = empCode (6 digits).
 * `reason` is the message shown to the blocked user when they try to register.
 * `email` and `fullName` are optional admin-side metadata for reference.
 */
export interface IneligibilityEntry {
  empCode: string;
  reason: string;
  email?: string;
  fullName?: string;
}

/** Predefined reasons admin can pick when adding an entry. Free text also allowed. */
export const INELIGIBILITY_REASON_PRESETS: string[] = [
  'Chưa đủ 12 tháng từ ngày thi gần nhất (The required 12-month interval from the previous test date has not been met yet).',
  'Ngày vào công ty của bạn sau ngày 15 của tháng thứ 2 trong quý này — vui lòng đăng ký vào quý sau (Your contract start date is after the 15th of the 2nd month of this quarter, please come back in next quarter).',
];

// ── Slots ─────────────────────────────────────────────────────────────────────

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

/** Fetch all slots, sorted by date+startMin. */
export async function listSlots(): Promise<Slot[]> {
  const snap = await getDocs(collection(db, 'slots'));
  const slots = snap.docs.map((d) => slotFromDoc(d.id, d.data()));
  slots.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.startMin - b.startMin;
  });
  return slots;
}

/** Auto-generate slotId from type/date/startMin: e.g. SP-2206-1330, 3S-2306-0900 */
export function generateSlotId(type: 'Speaking' | '3 Skills', date: string, startMin: number): string {
  const prefix = type === 'Speaking' ? 'SP' : '3S';
  const parts = date.split('-');
  const dd = parts[2] ?? '00';
  const mm = parts[1] ?? '00';
  const hh = String(Math.floor(startMin / 60)).padStart(2, '0');
  const mn = String(startMin % 60).padStart(2, '0');
  return `${prefix}-${dd}${mm}-${hh}${mn}`;
}

/** Create a new slot (admin). Throws if slotId already exists. */
export async function adminCreateSlot(
  adminEmail: string,
  payload: Omit<Slot, 'slotId' | 'remaining' | 'display'> & { remaining?: number },
  excludeSlotId?: string,
): Promise<string> {
  const slotId = generateSlotId(payload.type, payload.date, payload.startMin);
  const ref = doc(db, 'slots', slotId);
  const existing = await getDoc(ref);
  if (existing.exists()) throw new Error(`Ca thi "${slotId}" đã tồn tại.`);
  if (payload.startMin >= payload.endMin) throw new Error('Giờ bắt đầu phải trước giờ kết thúc.');
  if (payload.capacity <= 0) throw new Error('Sức chứa phải > 0.');

  // Chốt chặn nghiệp vụ: 2 ca CÙNG LOẠI không được chồng giờ trong cùng 1 ngày.
  // BTC chốt "mỗi loại chỉ 1 ca / khung giờ" → lịch Step 2 render full-width,
  // KHÔNG cần lane-packing (xem dev_handoff_2/CALENDAR_REDESIGN.md §5.1).
  const clash = (await listSlots()).find(
    (s) =>
      s.slotId !== excludeSlotId &&
      s.type === payload.type &&
      s.date === payload.date &&
      payload.startMin < s.endMin &&
      payload.endMin > s.startMin,
  );
  if (clash)
    throw new Error(
      `Ca này chồng giờ với ca "${clash.slotId}" (${minToHHmm(clash.startMin)}–${minToHHmm(clash.endMin)}) ` +
        `cùng loại ${payload.type} trong ngày. Mỗi loại chỉ 1 ca / khung giờ.`,
    );

  const remaining = payload.remaining ?? payload.capacity;
  await setDoc(ref, {
    type: payload.type,
    date: payload.date,
    session: payload.session ?? '',
    startMin: payload.startMin,
    endMin: payload.endMin,
    capacity: payload.capacity,
    remaining,
    location: payload.location ?? '',
  });

  void auditLog(adminEmail, 'admin.createSlot', { slotId, ...payload, remaining });
  return slotId;
}

/** Delete a slot (admin). Caller should warn about orphan registrations first. */
export async function adminDeleteSlot(adminEmail: string, slotId: string): Promise<void> {
  await deleteDoc(doc(db, 'slots', slotId));
  void auditLog(adminEmail, 'admin.deleteSlot', { slotId });
}

// ── Registrations ─────────────────────────────────────────────────────────────

/** List all registrations (admin only). */
export async function listRegistrations(): Promise<Registration[]> {
  const snap = await getDocs(collection(db, 'registrations'));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      email: d.id,
      empCode: data.empCode ?? '',
      fullName: data.fullName ?? '',
      bu: data.bu ?? '',
      speakingSlotId: data.speakingSlotId ?? null,
      skillsSlotId: data.skillsSlotId ?? null,
      createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate().toISOString() : null,
      updatedAt: data.updatedAt ? (data.updatedAt as Timestamp).toDate().toISOString() : null,
      changeCount: data.changeCount ?? 0,
    };
  });
}

/** List registrations that booked a specific slot (admin only). */
export async function listRegistrationsForSlot(slotId: string): Promise<Registration[]> {
  const [spSnap, skSnap] = await Promise.all([
    getDocs(query(collection(db, 'registrations'), where('speakingSlotId', '==', slotId))),
    getDocs(query(collection(db, 'registrations'), where('skillsSlotId', '==', slotId))),
  ]);
  const out = new Map<string, Registration>();
  const add = (d: any) => {
    const data = d.data();
    out.set(d.id, {
      email: d.id,
      empCode: data.empCode ?? '',
      fullName: data.fullName ?? '',
      bu: data.bu ?? '',
      speakingSlotId: data.speakingSlotId ?? null,
      skillsSlotId: data.skillsSlotId ?? null,
      createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate().toISOString() : null,
      updatedAt: data.updatedAt ? (data.updatedAt as Timestamp).toDate().toISOString() : null,
      changeCount: data.changeCount ?? 0,
    });
  };
  spSnap.docs.forEach(add);
  skSnap.docs.forEach(add);
  return Array.from(out.values());
}

/** Delete a registration (admin) — also restores slot remaining. */
export async function adminDeleteRegistration(adminEmail: string, targetEmail: string): Promise<void> {
  let deletedDetail: Record<string, unknown> = {};
  await runTransaction(db, async (tx) => {
    const regRef = doc(db, 'registrations', targetEmail);
    const regSnap = await tx.get(regRef);
    if (!regSnap.exists()) throw new Error('Không tìm thấy đăng ký.');
    const reg = regSnap.data();
    const claimRef = typeof reg.empCode === 'string' ? doc(db, 'empCodeClaims', reg.empCode) : null;

    // ── ALL READS first ──
    let spRemaining: number | null = null;
    let skRemaining: number | null = null;
    if (reg.speakingSlotId) {
      const s = await tx.get(doc(db, 'slots', reg.speakingSlotId));
      if (s.exists()) spRemaining = s.data().remaining ?? 0;
    }
    if (reg.skillsSlotId) {
      const s = await tx.get(doc(db, 'slots', reg.skillsSlotId));
      if (s.exists()) skRemaining = s.data().remaining ?? 0;
    }
    const claimSnap = claimRef ? await tx.get(claimRef) : null;

    // ── ALL WRITES below ──
    if (spRemaining !== null)
      tx.update(doc(db, 'slots', reg.speakingSlotId), { remaining: spRemaining + 1 });
    if (skRemaining !== null)
      tx.update(doc(db, 'slots', reg.skillsSlotId), { remaining: skRemaining + 1 });
    tx.delete(regRef);
    if (claimRef && claimSnap?.exists() && claimSnap.data().email === targetEmail)
      tx.delete(claimRef);

    deletedDetail = {
      targetEmail,
      empCode: reg.empCode,
      fullName: reg.fullName,
      bu: reg.bu,
      speakingSlotId: reg.speakingSlotId,
      skillsSlotId: reg.skillsSlotId,
    };
  });
  void auditLog(adminEmail, 'admin.deleteRegistration', deletedDetail);
}

/** Backfill /empCodeClaims from existing registrations (admin maintenance). */
export async function backfillEmpCodeClaims(adminEmail: string): Promise<BackfillEmpCodeClaimsResult> {
  void adminEmail;
  const repair = httpsCallable<Record<string, never>, BackfillEmpCodeClaimsResult>(functions, 'repairEmpCodeClaimsNow');
  const res = await repair({});
  return res.data;
}

// ── Config ────────────────────────────────────────────────────────────────────

/** Update config (admin). */
export async function updateConfig(
  adminEmail: string,
  updates: {
    allowEnrollment?: boolean;
    maxChanges?: number;
    deadline?: Date | null;
    emailConfirm?: boolean;
    adminEmails?: string[];
  }
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (updates.allowEnrollment !== undefined) payload.allowEnrollment = updates.allowEnrollment;
  if (updates.maxChanges !== undefined) payload.maxChanges = updates.maxChanges;
  if (updates.deadline !== undefined)
    payload.deadline = updates.deadline ? Timestamp.fromDate(updates.deadline) : deleteField();
  if (updates.emailConfirm !== undefined) payload.emailConfirm = updates.emailConfirm;
  if (updates.adminEmails !== undefined) payload.adminEmails = updates.adminEmails;

  await updateDoc(doc(db, 'config', 'main'), payload);
  void auditLog(adminEmail, 'admin.updateConfig', updates as Record<string, unknown>);
}

// ── Slot field updates (admin) ────────────────────────────────────────────────

export async function updateSlot(
  adminEmail: string,
  slotId: string,
  updates: Partial<Pick<Slot, 'capacity' | 'remaining' | 'location'>>
): Promise<void> {
  await updateDoc(doc(db, 'slots', slotId), updates);
  void auditLog(adminEmail, 'admin.updateSlot', { slotId, updates });
}

// ── Ineligibility (blocklist by empCode + reason) ────────────────────────────

/** List all ineligibility entries (admin only — requires list privilege per rules). */
export async function listIneligibility(): Promise<IneligibilityEntry[]> {
  const snap = await getDocs(collection(db, 'ineligibility'));
  return snap.docs.map((d) => ({
    empCode: d.id,
    reason: (d.data().reason as string) ?? '',
    email: d.data().email,
    fullName: d.data().fullName,
  }));
}

/**
 * Create or update an ineligibility entry (admin).
 * Throws if empCode is not 6 digits or reason is empty.
 */
export async function upsertIneligibility(
  adminEmail: string,
  empCode: string,
  data: { reason: string; email?: string; fullName?: string }
): Promise<void> {
  const code = empCode.trim();
  if (!/^\d{6}$/.test(code)) throw new Error('Mã NV phải là 6 chữ số.');
  const reason = data.reason.trim();
  if (!reason) throw new Error('Vui lòng nhập lý do.');
  const payload: Record<string, unknown> = { reason };
  if (data.email !== undefined && data.email.trim()) payload.email = data.email.trim().toLowerCase();
  if (data.fullName !== undefined && data.fullName.trim()) payload.fullName = data.fullName.trim();
  await setDoc(doc(db, 'ineligibility', code), payload, { merge: true });
  void auditLog(adminEmail, 'admin.upsertIneligibility', { empCode: code, ...payload });
}

export async function deleteIneligibility(adminEmail: string, empCode: string): Promise<void> {
  const code = empCode.trim();
  await deleteDoc(doc(db, 'ineligibility', code));
  void auditLog(adminEmail, 'admin.deleteIneligibility', { empCode: code });
}

// ── CSV export (browser download) ─────────────────────────────────────────────

export function downloadRegistrationsCsv(regs: Registration[], slots: Slot[]) {
  const slotMap = new Map(slots.map((s) => [s.slotId, s]));
  const fmtSlot = (id: string | null) => {
    if (!id) return '';
    const s = slotMap.get(id);
    if (!s) return id;
    const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const [y, mo, d] = s.date.split('-');
    return `${d}/${mo}/${y} ${hhmm(s.startMin)}-${hhmm(s.endMin)}`;
  };
  const csv = (v: unknown) => {
    if (v == null) return '';
    let s = String(v);
    // Prevent CSV formula injection (CWE-1236): escape prefix that Excel/Sheets evaluate as formulas
    if (/^[=+\-@\t|]/.test(s)) s = "'" + s;
    // Escape newlines within values to prevent row injection
    s = s.replace(/\r?\n/g, ' ');
    return /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const rows = [
    ['Email', 'Mã NV', 'Họ tên', 'BU', 'Speaking', 'Speaking ID', '3 Skills', '3 Skills ID', 'Số lần đổi', 'Đăng ký lúc', 'Cập nhật lúc'],
    ...regs.map((r) => [
      r.email,
      r.empCode,
      r.fullName,
      r.bu,
      fmtSlot(r.speakingSlotId),
      r.speakingSlotId ?? '',
      fmtSlot(r.skillsSlotId),
      r.skillsSlotId ?? '',
      r.changeCount,
      r.createdAt ? new Date(r.createdAt).toLocaleString('vi-VN') : '',
      r.updatedAt ? new Date(r.updatedAt).toLocaleString('vi-VN') : '',
    ]),
  ];
  const text = '﻿' + rows.map((row) => row.map(csv).join(',')).join('\n');
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `registrations-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
