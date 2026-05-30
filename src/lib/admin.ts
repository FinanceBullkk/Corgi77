import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Admins are configured at runtime in /config/main.adminEmails.
 * There are intentionally no built-in personal admin emails in the client.
 */
export const ADMIN_EMAILS: string[] = [];

// In-memory cache of /config/main.adminEmails.
// Populated by `fetchAdminEmails()` once per session.
let cachedAdminEmails: string[] | null = null;

/**
 * Fetch admin emails from /config/main.adminEmails. Caches the result for
 * subsequent sync `isAdmin()` calls.
 */
export async function fetchAdminEmails(): Promise<string[]> {
  try {
    const snap = await getDoc(doc(db, 'config', 'main'));
    const fromCfg = snap.exists()
      ? ((snap.data() as { adminEmails?: string[] }).adminEmails ?? [])
      : [];
    const configured = Array.from(new Set(fromCfg.map((e) => String(e).trim().toLowerCase()).filter(Boolean)));
    cachedAdminEmails = configured;
    return configured;
  } catch (e) {
    console.warn('fetchAdminEmails failed; admin cache remains empty:', e);
    cachedAdminEmails = [];
    return cachedAdminEmails;
  }
}

/**
 * Synchronous admin check. Uses the cached list populated by `fetchAdminEmails()`.
 *
 * Call `fetchAdminEmails()` once at app start to populate the cache. Until then,
 * no client-side admin affordance is shown; Firestore rules and Cloud Functions
 * are the source of truth.
 */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  if (cachedAdminEmails && cachedAdminEmails.includes(lower)) return true;
  return false;
}
