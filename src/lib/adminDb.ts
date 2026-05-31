import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { minToHHmm, type Slot } from './types';
import { auditLog } from './audit';
import { slotFromDoc } from './slot-helpers';
import { listRegistrationsForSlot } from './admin-registrations';
export { downloadAllRegistrationsCsv, downloadRegistrationsCsv, type CsvExportProgress } from './csv-export';
export { updateConfig } from './admin-config';
export {
  INELIGIBILITY_REASON_PRESETS,
  deleteIneligibility,
  listIneligibility,
  upsertIneligibility,
  type IneligibilityEntry,
} from './admin-ineligibility';
export {
  REGISTRATIONS_PAGE_SIZE,
  adminDeleteRegistration,
  backfillEmpCodeClaims,
  cleanupRegistrationEmailFields,
  countRegistrations,
  listRegistrations,
  listRegistrationsForSlot,
  listRegistrationsPage,
  type BackfillEmpCodeClaimsResult,
  type CleanupRegistrationEmailFieldsResult,
  type Registration,
  type RegistrationPageCursor,
  type RegistrationsPage,
} from './admin-registrations';

// ── Slots ─────────────────────────────────────────────────────────────────────

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
  const sameDaySnap = await getDocs(query(collection(db, 'slots'), where('date', '==', payload.date)));
  const clash = sameDaySnap.docs.map((d) => slotFromDoc(d.id, d.data())).find(
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

/** Delete a slot (admin). Refuses to orphan existing registrations. */
export async function adminDeleteSlot(adminEmail: string, slotId: string): Promise<void> {
  const registrations = await listRegistrationsForSlot(slotId);
  if (registrations.length > 0) {
    throw new Error(`Không thể xoá ca ${slotId} vì đang có ${registrations.length} đăng ký. Hãy huỷ hoặc chuyển các đăng ký này trước.`);
  }

  await runTransaction(db, async (tx) => {
    const slotRef = doc(db, 'slots', slotId);
    const slotSnap = await tx.get(slotRef);
    if (!slotSnap.exists()) return;
    const slot = slotSnap.data();
    const capacity = typeof slot.capacity === 'number' ? slot.capacity : 0;
    const remaining = typeof slot.remaining === 'number' ? slot.remaining : capacity;
    if (capacity - remaining > 0) {
      throw new Error(`Không thể xoá ca ${slotId} vì đang có người đăng ký. Tải lại danh sách rồi thử lại.`);
    }
    tx.delete(slotRef);
  });
  void auditLog(adminEmail, 'admin.deleteSlot', { slotId });
}

// ── Slot field updates (admin) ────────────────────────────────────────────────

export async function updateSlot(
  adminEmail: string,
  slotId: string,
  updates: Partial<Pick<Slot, 'capacity' | 'remaining' | 'location'>>
): Promise<void> {
  if (updates.remaining !== undefined && updates.remaining < 0) {
    throw new Error('remaining không được âm');
  }
  await updateDoc(doc(db, 'slots', slotId), updates);
  void auditLog(adminEmail, 'admin.updateSlot', { slotId, updates });
}
