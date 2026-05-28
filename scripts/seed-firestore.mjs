/**
 * Seed Firestore with slots + config data from Booking App.xlsx
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/seed-firestore.mjs
 *
 * Get service account key:
 *   Firebase Console → Project Settings → Service Accounts → Generate new private key
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Init ─────────────────────────────────────────────────────────────────────

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) {
  console.error('❌  Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path.');
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(readFileSync(resolve(credPath), 'utf8'))) });
const db = getFirestore();

// ── Helpers ───────────────────────────────────────────────────────────────────

function minToHHmm(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatDateVi(yyyyMmDd) {
  const [y, m, d] = yyyyMmDd.split('-');
  return `${d}/${m}/${y}`;
}

// ── Slot data (parsed from Booking App.xlsx) ──────────────────────────────────
//   date: YYYY-MM-DD (from Excel serials 46195–46198 = June 22–25, 2026)
//   startMin / endMin: minutes since midnight (from Excel time fractions × 24 × 60)

const slots = [
  // ── Speaking ──────────────────────────────────────────────────────────────
  { id: 'SP-2206-1330', type: 'Speaking', date: '2026-06-22', session: 'PM', startMin: 810,  endMin: 870,  capacity: 8 },
  { id: 'SP-2206-1500', type: 'Speaking', date: '2026-06-22', session: 'PM', startMin: 900,  endMin: 960,  capacity: 8 },
  { id: 'SP-2306-0900', type: 'Speaking', date: '2026-06-23', session: 'AM', startMin: 540,  endMin: 600,  capacity: 8 },
  { id: 'SP-2306-1030', type: 'Speaking', date: '2026-06-23', session: 'AM', startMin: 630,  endMin: 690,  capacity: 8 },
  { id: 'SP-2306-1330', type: 'Speaking', date: '2026-06-23', session: 'PM', startMin: 810,  endMin: 870,  capacity: 8 },
  { id: 'SP-2306-1500', type: 'Speaking', date: '2026-06-23', session: 'PM', startMin: 900,  endMin: 960,  capacity: 8 },
  { id: 'SP-2406-0900', type: 'Speaking', date: '2026-06-24', session: 'AM', startMin: 540,  endMin: 600,  capacity: 8 },
  { id: 'SP-2406-1030', type: 'Speaking', date: '2026-06-24', session: 'AM', startMin: 630,  endMin: 690,  capacity: 8 },
  // ── 3 Skills ──────────────────────────────────────────────────────────────
  { id: '3S-2206-0900', type: '3 Skills', date: '2026-06-22', session: 'AM', startMin: 540,  endMin: 690,  capacity: 14 },
  { id: '3S-2306-0900', type: '3 Skills', date: '2026-06-23', session: 'AM', startMin: 540,  endMin: 690,  capacity: 14 },
  { id: '3S-2306-1330', type: '3 Skills', date: '2026-06-23', session: 'PM', startMin: 810,  endMin: 960,  capacity: 14 },
  { id: '3S-2406-0900', type: '3 Skills', date: '2026-06-24', session: 'AM', startMin: 540,  endMin: 690,  capacity: 14 },
  { id: '3S-2406-1330', type: '3 Skills', date: '2026-06-24', session: 'PM', startMin: 810,  endMin: 960,  capacity: 14 },
  { id: '3S-2506-0900', type: '3 Skills', date: '2026-06-25', session: 'AM', startMin: 540,  endMin: 690,  capacity: 14 },
];

// ── Config ────────────────────────────────────────────────────────────────────
// Deadline from Excel: June 3, 2026 05:00 UTC = 12:00 noon VN (UTC+7)
// Adjust if needed.
const DEADLINE = new Date('2026-06-03T05:00:00Z'); // ← change if needed

// ── Seed ──────────────────────────────────────────────────────────────────────

async function seed() {
  const batch = db.batch();

  // Config
  batch.set(db.doc('config/main'), {
    allowEnrollment: true,
    maxChanges: 3,
    deadline: Timestamp.fromDate(DEADLINE),
    emailConfirm: false,
  });
  console.log('✔  config/main');

  // Slots
  for (const s of slots) {
    const display = `${s.type} | ${formatDateVi(s.date)} | ${minToHHmm(s.startMin)}–${minToHHmm(s.endMin)}`;
    batch.set(db.doc(`slots/${s.id}`), {
      type: s.type,
      date: s.date,
      session: s.session,
      startMin: s.startMin,
      endMin: s.endMin,
      capacity: s.capacity,
      remaining: s.capacity,
      location: '',
      display,
    });
    console.log(`✔  slots/${s.id}  →  ${display}`);
  }

  await batch.commit();
  console.log(`\n✅  Seeded ${slots.length} slots + config. Done.`);
}

seed().catch((e) => { console.error('❌', e.message); process.exit(1); });
