import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { auditLog } from './audit';

export interface IneligibilityEntry {
  empCode: string;
  reason: string;
  email?: string;
  fullName?: string;
}

export const INELIGIBILITY_REASON_PRESETS: string[] = [
  'Chưa đủ 12 tháng từ ngày thi gần nhất (The required 12-month interval from the previous test date has not been met yet).',
  'Ngày vào công ty của bạn sau ngày 15 của tháng thứ 2 trong quý này — vui lòng đăng ký vào quý sau (Your contract start date is after the 15th of the 2nd month of this quarter, please come back in next quarter).',
];

export async function listIneligibility(): Promise<IneligibilityEntry[]> {
  const snap = await getDocs(collection(db, 'ineligibility'));
  return snap.docs.map((d) => ({
    empCode: d.id,
    reason: (d.data().reason as string) ?? '',
    email: d.data().email,
    fullName: d.data().fullName,
  }));
}

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
