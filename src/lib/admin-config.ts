import { deleteField, doc, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { auditLog } from './audit';

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
