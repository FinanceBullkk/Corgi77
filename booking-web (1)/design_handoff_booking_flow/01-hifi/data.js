// ─────────────────────────────────────────────────────────────────────────
// Mock data + helpers
// ─────────────────────────────────────────────────────────────────────────

// Days for Q2 2026 (Mon-Fri x 2 weeks)
const DAYS = [
  { id: 'mon-22', day: 'T2', date: '22/06', iso: '2026-06-22', label: 'Thứ 2 · 22/06' },
  { id: 'tue-23', day: 'T3', date: '23/06', iso: '2026-06-23', label: 'Thứ 3 · 23/06' },
  { id: 'wed-24', day: 'T4', date: '24/06', iso: '2026-06-24', label: 'Thứ 4 · 24/06' },
  { id: 'thu-25', day: 'T5', date: '25/06', iso: '2026-06-25', label: 'Thứ 5 · 25/06' },
  { id: 'fri-26', day: 'T6', date: '26/06', iso: '2026-06-26', label: 'Thứ 6 · 26/06' },
];

// Time grid (09:00 → 17:00, hourly)
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17];

// Slots
//   type: 'sp' (Speaking, 60min) or 'sk' (3 Skills, 120min)
//   start/end: minutes from 00:00 (e.g. 9*60 = 540 = 09:00)
let SLOT_ID = 0;
const slot = (type, dayId, startHM, endHM, capacity, taken, room) => ({
  id: `s${++SLOT_ID}`,
  type, dayId,
  start: hm(startHM), end: hm(endHM),
  startLabel: startHM, endLabel: endHM,
  capacity, taken, room,
  full: taken >= capacity,
  remaining: capacity - taken,
});
function hm(s) {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}
function fmtHM(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const SLOTS = [
  // ── Speaking (60 min)
  slot('sp', 'mon-22', '09:00', '10:00', 8, 2, 'Phòng A · T5'),
  slot('sp', 'mon-22', '10:30', '11:30', 8, 8, 'Phòng A · T5'),  // full
  slot('sp', 'mon-22', '13:30', '14:30', 8, 3, 'Phòng A · T5'),
  slot('sp', 'mon-22', '15:00', '16:00', 8, 6, 'Phòng A · T5'),  // warn (2 left)

  slot('sp', 'tue-23', '09:00', '10:00', 8, 2, 'Phòng A · T5'),
  slot('sp', 'tue-23', '14:00', '15:00', 8, 1, 'Phòng A · T5'),

  slot('sp', 'thu-25', '10:00', '11:00', 8, 7, 'Phòng A · T5'),  // warn
  slot('sp', 'thu-25', '15:00', '16:00', 8, 0, 'Phòng A · T5'),

  slot('sp', 'fri-26', '09:00', '10:00', 8, 4, 'Phòng A · T5'),
  slot('sp', 'fri-26', '14:00', '15:00', 8, 3, 'Phòng A · T5'),

  // ── 3 Skills (120 min)
  slot('sk', 'mon-22', '13:00', '15:00', 10, 4, 'Phòng B · T5'),
  slot('sk', 'tue-23', '09:00', '11:00', 10, 6, 'Phòng B · T5'),
  slot('sk', 'wed-24', '09:00', '11:00', 10, 3, 'Phòng B · T5'),
  slot('sk', 'wed-24', '14:00', '16:00', 10, 7, 'Phòng B · T5'),  // warn
  slot('sk', 'thu-25', '09:00', '11:00', 10, 2, 'Phòng B · T5'),
  slot('sk', 'thu-25', '14:00', '16:00', 10, 10, 'Phòng B · T5'),  // full
  slot('sk', 'fri-26', '13:00', '15:00', 10, 5, 'Phòng B · T5'),
];

// Helpers
function dayOf(id) { return DAYS.find(d => d.id === id); }
function slotById(id) { return SLOTS.find(s => s.id === id); }

// Check if two slots overlap in time AND on the same day
function conflicts(a, b) {
  if (!a || !b) return false;
  if (a.dayId !== b.dayId) return false;
  return a.start < b.end && b.start < a.end;
}

// Availability tier for color tag
function tier(s) {
  if (s.full) return 'full';
  const ratio = s.remaining / s.capacity;
  if (ratio <= 0.3) return 'warn';
  return 'ok';
}

// Format slot for display
function fmtSlot(s) {
  if (!s) return '';
  const d = dayOf(s.dayId);
  return `${d.label} · ${s.startLabel}–${s.endLabel}`;
}

Object.assign(window, {
  DAYS, HOURS, SLOTS, dayOf, slotById, conflicts, tier, fmtSlot, fmtHM,
});
