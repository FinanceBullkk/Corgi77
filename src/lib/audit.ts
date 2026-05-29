import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

export type AuditEvent =
  | 'book.create'
  | 'book.update'
  | 'book.cancel'
  | 'book.rejected.blocked'
  | 'admin.deleteRegistration'
  | 'admin.updateSlot'
  | 'admin.createSlot'
  | 'admin.deleteSlot'
  | 'admin.updateConfig'
  | 'admin.upsertIneligibility'
  | 'admin.deleteIneligibility';

/**
 * Append an immutable entry to /auditLogs.
 * Non-blocking: failures are logged to console but never thrown
 * so they cannot break the calling operation.
 */
export async function auditLog(
  email: string,
  event: AuditEvent,
  detail?: Record<string, unknown>
): Promise<void> {
  try {
    await addDoc(collection(db, 'auditLogs'), {
      timestamp: serverTimestamp(),
      email,
      event,
      detail: detail ?? {},
    });
  } catch (e) {
    // Never block the caller — just log to console
    console.warn('Audit log failed (non-blocking):', e);
  }
}

export interface AuditEntry {
  id: string;
  timestamp: string | null;
  email: string;
  event: string;
  detail: Record<string, unknown>;
}

/** List recent audit log entries (admin only — rules enforce). */
export async function listAuditLogs(max = 200): Promise<AuditEntry[]> {
  const q = query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    const ts = data.timestamp as Timestamp | undefined;
    return {
      id: d.id,
      timestamp: ts ? ts.toDate().toISOString() : null,
      email: data.email ?? '',
      event: data.event ?? '',
      detail: (data.detail as Record<string, unknown>) ?? {},
    };
  });
}
