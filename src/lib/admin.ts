import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Hardcoded bootstrap admins. Always have admin access regardless of
 * /config/main state. Mirrored in firestore.rules `isHardcodedAdmin()`.
 *
 * Additional admins can be added at runtime via /config/main.adminEmails
 * (see `fetchAdminEmails`).
 */
export const ADMIN_EMAILS = [
  'hao.nha@cyberlogitec.com',
  'phuc.lnk@cyberlogitec.com',
  'anhhao.dl108@gmail.com',
];

// In-memory cache of merged admin list (hardcoded + Firestore).
// Populated by `fetchAdminEmails()` once per session.
let cachedAdminEmails: string[] | null = null;

/**
 * Fetch admin emails from /config/main.adminEmails, merged with the
 * hardcoded fallback. Caches the result for subsequent sync `isAdmin()` calls.
 *
 * Safe to call before /config/main exists — falls back to hardcoded list.
 */
export async function fetchAdminEmails(): Promise<string[]> {
  try {
    const snap = await getDoc(doc(db, 'config', 'main'));
    const fromCfg = snap.exists()
      ? ((snap.data() as { adminEmails?: string[] }).adminEmails ?? [])
      : [];
    const merged = Array.from(
      new Set([
        ...ADMIN_EMAILS.map((e) => e.toLowerCase()),
        ...fromCfg.map((e) => String(e).toLowerCase()),
      ])
    );
    cachedAdminEmails = merged;
    return merged;
  } catch (e) {
    console.warn('fetchAdminEmails failed, using hardcoded fallback:', e);
    cachedAdminEmails = ADMIN_EMAILS.map((e) => e.toLowerCase());
    return cachedAdminEmails;
  }
}

/**
 * Synchronous admin check. Uses the cached list populated by `fetchAdminEmails()`,
 * with the hardcoded fallback list as the floor (always available).
 *
 * Call `fetchAdminEmails()` once at app start to populate the cache;
 * until then, only hardcoded admins are recognized.
 */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  if (ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(lower)) return true;
  if (cachedAdminEmails && cachedAdminEmails.includes(lower)) return true;
  return false;
}
