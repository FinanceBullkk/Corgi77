import {
  collection,
  doc,
  getCountFromServer,
  getDocs,
  documentId,
  query,
  runTransaction,
  startAfter,
  Timestamp,
  where,
  limit,
  orderBy,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import type { MyBooking } from './types';
import { auditLog } from './audit';
import { captureError } from './monitoring';

export const REGISTRATIONS_PAGE_SIZE = 100;
const MAX_REGISTRATIONS_EXPORT = 5000;

export interface Registration extends MyBooking {
  email: string;
}

export type RegistrationPageCursor = QueryDocumentSnapshot<DocumentData>;

export interface RegistrationsPage {
  items: Registration[];
  nextCursor: RegistrationPageCursor | null;
  total: number;
}

export interface BackfillEmpCodeClaimsResult {
  created: number;
  kept: number;
  skippedDuplicates: Array<{ empCode: string; emails: string[] }>;
  conflicts: Array<{ empCode: string; claimEmail: string; registrationEmail: string }>;
}

export interface CleanupRegistrationEmailFieldsResult {
  scanned: number;
  cleaned: number;
}

function registrationFromDoc(d: { id: string; data: () => Record<string, any> }): Registration {
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
}

export async function countRegistrations(): Promise<number> {
  const snap = await getCountFromServer(collection(db, 'registrations'));
  return snap.data().count;
}

export async function listRegistrationsPage(
  cursor: RegistrationPageCursor | null = null,
  pageSize = REGISTRATIONS_PAGE_SIZE,
): Promise<RegistrationsPage> {
  const constraints = cursor
    ? [orderBy(documentId()), startAfter(cursor), limit(pageSize)]
    : [orderBy(documentId()), limit(pageSize)];
  const [snap, total] = await Promise.all([
    getDocs(query(collection(db, 'registrations'), ...constraints)),
    countRegistrations(),
  ]);
  return {
    items: snap.docs.map(registrationFromDoc),
    nextCursor: snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null,
    total,
  };
}

export async function listRegistrations(): Promise<Registration[]> {
  const snap = await getDocs(query(collection(db, 'registrations'), orderBy(documentId()), limit(MAX_REGISTRATIONS_EXPORT)));
  if (snap.docs.length === MAX_REGISTRATIONS_EXPORT) {
    captureError(
      new Error(`listRegistrations hit cap ${MAX_REGISTRATIONS_EXPORT} — list may be truncated`),
      { operation: 'listRegistrations.cap' },
    );
  }
  return snap.docs.map(registrationFromDoc);
}

export async function listRegistrationsForSlot(slotId: string): Promise<Registration[]> {
  const [spSnap, skSnap] = await Promise.all([
    getDocs(query(collection(db, 'registrations'), where('speakingSlotId', '==', slotId))),
    getDocs(query(collection(db, 'registrations'), where('skillsSlotId', '==', slotId))),
  ]);
  const out = new Map<string, Registration>();
  const add = (d: QueryDocumentSnapshot<DocumentData>) => {
    out.set(d.id, registrationFromDoc(d));
  };
  spSnap.docs.forEach(add);
  skSnap.docs.forEach(add);
  return Array.from(out.values());
}

export async function adminDeleteRegistration(adminEmail: string, targetEmail: string): Promise<void> {
  let deletedDetail: Record<string, unknown> = {};
  await runTransaction(db, async (tx) => {
    const regRef = doc(db, 'registrations', targetEmail);
    const regSnap = await tx.get(regRef);
    if (!regSnap.exists()) throw new Error('Không tìm thấy đăng ký.');
    const reg = regSnap.data();
    const claimRef = typeof reg.empCode === 'string' ? doc(db, 'empCodeClaims', reg.empCode) : null;

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

export async function backfillEmpCodeClaims(adminEmail: string): Promise<BackfillEmpCodeClaimsResult> {
  void adminEmail;
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const repair = httpsCallable<Record<string, never>, BackfillEmpCodeClaimsResult>(getFunctions(), 'repairEmpCodeClaimsNow');
  const res = await repair({});
  return res.data;
}

export async function cleanupRegistrationEmailFields(adminEmail: string): Promise<CleanupRegistrationEmailFieldsResult> {
  void adminEmail;
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const cleanup = httpsCallable<Record<string, never>, CleanupRegistrationEmailFieldsResult>(
    getFunctions(),
    'cleanupRegistrationEmailFieldsNow',
  );
  const res = await cleanup({});
  return res.data;
}
