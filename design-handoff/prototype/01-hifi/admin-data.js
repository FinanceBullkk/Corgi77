// ─────────────────────────────────────────────────────────────────────────
// Admin Panel · mock data — modelled on the real Corgi7 domain
//   Slot ID format: SP-2306-1500 (Speaking 23/06 15:00) · 3S-2406-0900
//   Capacity: Speaking = 8 · 3 Skills = 14
// ─────────────────────────────────────────────────────────────────────────

const KỲ = 'Assessment Q2 2026';

// ─── Slots (14, the real set from the Ca thi tab) ──────────────────────────
// type sp|sk · date dd/mm · start–end · cap · booked · room
const A_SLOTS = [
  { id: '3S-2206-0900', type: 'sk', date: '22/06', dow: 'T2', start: '09:00', end: '11:30', cap: 14, booked: 0,  room: 'Phòng B07' },
  { id: 'SP-2206-1330', type: 'sp', date: '22/06', dow: 'T2', start: '13:30', end: '14:30', cap: 8,  booked: 0,  room: 'Phòng A12' },
  { id: 'SP-2206-1500', type: 'sp', date: '22/06', dow: 'T2', start: '15:00', end: '16:00', cap: 8,  booked: 1,  room: 'Phòng A12' },
  { id: '3S-2306-0900', type: 'sk', date: '23/06', dow: 'T3', start: '09:00', end: '11:30', cap: 14, booked: 0,  room: 'Phòng B07' },
  { id: 'SP-2306-0900', type: 'sp', date: '23/06', dow: 'T3', start: '09:00', end: '10:00', cap: 8,  booked: 0,  room: 'Phòng A12' },
  { id: 'SP-2306-1030', type: 'sp', date: '23/06', dow: 'T3', start: '10:30', end: '11:30', cap: 8,  booked: 0,  room: 'Phòng A12' },
  { id: '3S-2306-1330', type: 'sk', date: '23/06', dow: 'T3', start: '13:30', end: '16:00', cap: 14, booked: 0,  room: 'Phòng B07' },
  { id: 'SP-2306-1330', type: 'sp', date: '23/06', dow: 'T3', start: '13:30', end: '14:30', cap: 8,  booked: 0,  room: 'Phòng A12' },
  { id: 'SP-2306-1500', type: 'sp', date: '23/06', dow: 'T3', start: '15:00', end: '16:00', cap: 8,  booked: 1,  room: 'Phòng A12' },
  { id: '3S-2406-0900', type: 'sk', date: '24/06', dow: 'T4', start: '09:00', end: '11:30', cap: 14, booked: 2,  room: 'Phòng B07' },
  { id: 'SP-2406-0900', type: 'sp', date: '24/06', dow: 'T4', start: '09:00', end: '10:00', cap: 8,  booked: 0,  room: 'Phòng A12' },
  { id: 'SP-2406-1030', type: 'sp', date: '24/06', dow: 'T4', start: '10:30', end: '11:30', cap: 8,  booked: 0,  room: 'Phòng A12' },
  { id: '3S-2406-1330', type: 'sk', date: '24/06', dow: 'T4', start: '13:30', end: '16:00', cap: 14, booked: 0,  room: 'Phòng B07' },
  { id: '3S-2506-0900', type: 'sk', date: '25/06', dow: 'T5', start: '09:00', end: '11:30', cap: 14, booked: 0,  room: 'Phòng B07' },
];

// allow new registration toggle (from Cấu hình)
const A_OPEN = true;

// ─── Bookings (sample volume to show the grid; real count is small early on)
const A_BOOKINGS = [
  { empCode: '262011', name: 'wdads',            bu: 'DSADSA',  email: 'anhhao.dl108@gmail.com',     sp: 'SP-2306-1500', sk: '3S-2406-0900', changes: 0, at: '23:06 28/05' },
  { empCode: '242002', name: 'Lê Ngọc Kỳ Phúc',  bu: 'BSG',     email: 'phuc.lnk@cyberlogitec.com',  sp: 'SP-2206-1500', sk: '3S-2406-0900', changes: 1, at: '02:44 28/05' },
  { empCode: '222223', name: 'Trần Quốc Hảo',     bu: 'ASD',     email: 'hao.nha@cyberlogitec.com',   sp: 'SP-2306-0900', sk: '3S-2306-1330', changes: 2, at: '09:14 27/05' },
  { empCode: '262109', name: 'Nguyễn Nắd',        bu: 'LBU',     email: 'nad.ng@cyberlogitec.com',    sp: 'SP-2406-1030', sk: '3S-2406-1330', changes: 3, at: '08:31 27/05' },
  { empCode: '262200', name: 'Phạm Thu Hà',       bu: 'ITS-PHX', email: 'ha.pt@cyberlogitec.com',     sp: 'SP-2206-1330', sk: '3S-2206-0900', changes: 0, at: '16:20 26/05' },
  { empCode: '262318', name: 'Đỗ Minh Khang',     bu: 'ITS-PHX', email: 'khang.dm@cyberlogitec.com',  sp: 'SP-2306-1030', sk: '3S-2306-0900', changes: 0, at: '15:02 26/05' },
  { empCode: '241990', name: 'Vũ Hải Long',       bu: 'OPUS',    email: 'long.vh@cyberlogitec.com',   sp: 'SP-2406-0900', sk: '3S-2506-0900', changes: 1, at: '11:48 26/05' },
  { empCode: '262455', name: 'Hoàng Bảo Châu',    bu: 'BSG',     email: 'chau.hb@cyberlogitec.com',   sp: 'SP-2306-1330', sk: '3S-2306-1330', changes: 0, at: '09:33 26/05' },
  { empCode: '243011', name: 'Lý Gia Bảo',        bu: 'LBU',     email: 'bao.lg@cyberlogitec.com',    sp: 'SP-2206-1500', sk: '3S-2406-1330', changes: 2, at: '21:21 25/05' },
  { empCode: '262877', name: 'Ngô Thanh Tú',      bu: 'OPUS',    email: 'tu.nt@cyberlogitec.com',     sp: 'SP-2406-1030', sk: '3S-2206-0900', changes: 0, at: '18:10 25/05' },
  { empCode: '241655', name: 'Bùi Khánh Vy',      bu: 'ASD',     email: 'vy.bk@cyberlogitec.com',     sp: 'SP-2306-0900', sk: '3S-2506-0900', changes: 0, at: '14:02 25/05' },
  { empCode: '262090', name: 'Đặng Quốc Huy',     bu: 'ITS-PHX', email: 'huy.dq@cyberlogitec.com',    sp: 'SP-2406-0900', sk: '3S-2406-1330', changes: 1, at: '10:55 25/05' },
];

// ─── Block list / ineligibility (3 real rows) ─────────────────────────────
const R_12MO = { vn: 'Chưa đủ 12 tháng từ ngày thi gần nhất.', en: 'The required 12-month interval from the previous test date has not been met yet.' };
const R_CONTRACT = { vn: 'Ngày vào công ty sau ngày 15 của tháng thứ 2 trong quý này — vui lòng đăng ký vào quý sau.', en: 'Your contract start date is after the 15th of the 2nd month of this quarter, please come back next quarter.' };

const A_BLOCKS = [
  { empCode: '222222', reason: R_12MO,     name: null, email: null, by: 'anhhao.dl108@gmail.com',  at: '20:10 28/05' },
  { empCode: '262010', reason: R_CONTRACT, name: null, email: null, by: 'hao.nha@cyberlogitec.com', at: '11:30 27/05' },
  { empCode: '262100', reason: R_12MO,     name: null, email: null, by: 'anhhao.dl108@gmail.com',  at: '02:43 28/05' },
];

// ─── Audit log (human-readable; raw events translated to diffs) ────────────
const A_AUDIT = [
  { at: '23:09 28/05', ago: '2 phút trước', actor: 'anhhao.dl108@gmail.com', ev: 'update', subject: 'hao · 222223',
    diffs: [ { k: 'Speaking', from: 'SP-2306-1500', to: 'SP-2306-1030' }, { k: '3 Skills', from: '3S-2406-0900', to: '3S-2306-1330' } ], meta: 'Lần đổi #1' },
  { at: '23:06 28/05', ago: '5 phút trước', actor: 'anhhao.dl108@gmail.com', ev: 'create', subject: 'wdads · 262011',
    diffs: [ { k: 'Speaking', to: 'SP-2306-1500' }, { k: '3 Skills', to: '3S-2406-0900' } ], meta: 'BU: DSADSA' },
  { at: '23:05 28/05', ago: '6 phút trước', actor: 'anhhao.dl108@gmail.com', ev: 'cancel', subject: '262318', diffs: [], note: 'Huỷ toàn bộ đăng ký.' },
  { at: '23:04 28/05', ago: '7 phút trước', actor: 'anhhao.dl108@gmail.com', ev: 'update', subject: 'hao · 222223',
    diffs: [ { k: 'Speaking', from: 'SP-2306-0900', to: 'SP-2306-0900' }, { k: '3 Skills', from: '3S-2306-1330', to: '3S-2306-1330' } ], meta: 'Lần đổi #2' },
  { at: '20:10 28/05', ago: 'Hôm nay', actor: 'anhhao.dl108@gmail.com', ev: 'block', subject: '222222', diffs: [], note: 'Chưa đủ 12 tháng từ ngày thi gần nhất.' },
  { at: '09:14 27/05', ago: 'Hôm qua', actor: 'hao.nha@cyberlogitec.com', ev: 'cancel', subject: '262318', diffs: [], note: 'Huỷ toàn bộ đăng ký.' },
  { at: '08:31 27/05', ago: 'Hôm qua', actor: 'hao.nha@cyberlogitec.com', ev: 'update', subject: 'Nắd · 262109',
    diffs: [ { k: 'Speaking', from: 'SP-2406-1030', to: 'SP-2406-0900' }, { k: '3 Skills', from: '3S-2306-0900', to: '3S-2406-1330' } ], meta: 'Lần đổi #3 · BU: LBU' },
  { at: '02:44 27/05', ago: 'Hôm qua', actor: 'hao.nha@cyberlogitec.com', ev: 'update', subject: 'Nắd · 262109',
    diffs: [ { k: 'Speaking', from: 'SP-2206-1500', to: 'SP-2306-0900' }, { k: '3 Skills', from: '3S-2406-0900', to: '3S-2406-1030' } ], meta: 'Lần đổi #2' },
  { at: '02:43 27/05', ago: 'Hôm qua', actor: 'anhhao.dl108@gmail.com', ev: 'block', subject: '262100', diffs: [], note: 'Chưa đủ 12 tháng từ ngày thi gần nhất.' },
];

// ─── Derived helpers ───────────────────────────────────────────────────────
function aTypeLabel(t) { return t === 'sp' ? 'Speaking' : '3 Skills'; }
function aSlotById(id) { return A_SLOTS.find(s => s.id === id) || null; }
function aSlotLabel(id) {
  if (!id) return '—';
  const s = aSlotById(id);
  if (s) return `${s.date} · ${s.start}–${s.end}`;
  // fallback: parse TYPE-DDMM-HHMM (e.g. SP-2306-1500 → 23/06 · 15:00)
  const m = /^(?:SP|3S)-(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(id);
  if (m) return `${m[1]}/${m[2]} · ${m[3]}:${m[4]}`;
  return id;
}
function aSlotStatus(s) {
  if (!A_OPEN) return 'closed';
  const rem = s.cap - s.booked;
  if (rem <= 0) return 'full';
  if (rem / s.cap <= 0.25) return 'warn';
  return 'ok';
}
function aStatusLabel(st) {
  return { ok: 'Còn chỗ', warn: 'Sắp đầy', full: 'Đã đầy', closed: 'Đã đóng' }[st];
}

// totals
function aTotals() {
  const sp = A_SLOTS.filter(s => s.type === 'sp');
  const sk = A_SLOTS.filter(s => s.type === 'sk');
  const sum = (arr, k) => arr.reduce((a, s) => a + s[k], 0);
  return {
    bookings: A_BOOKINGS.length,
    slots: A_SLOTS.length,
    spCap: sum(sp, 'cap'), spBooked: sum(sp, 'booked'),
    skCap: sum(sk, 'cap'), skBooked: sum(sk, 'booked'),
    blocks: A_BLOCKS.length,
  };
}

Object.assign(window, {
  KỲ, A_SLOTS, A_OPEN, A_BOOKINGS, A_BLOCKS, A_AUDIT,
  aTypeLabel, aSlotById, aSlotLabel, aSlotStatus, aStatusLabel, aTotals,
});
