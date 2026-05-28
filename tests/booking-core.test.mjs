import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Nạp gas/booking-core.js nguyên văn vào sandbox để test ĐÚNG code sẽ push lên GAS.
const coreSrc = readFileSync(new URL('../gas/booking-core.js', import.meta.url), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(coreSrc, ctx);
const { evaluateBooking_, countBooked_ } = ctx;

assert.equal(typeof evaluateBooking_, 'function', 'evaluateBooking_ phải load được từ booking-core.js');
assert.equal(typeof countBooked_, 'function', 'countBooked_ phải load được từ booking-core.js');

function slot(slotId, type, date, startMin, endMin, capacity) {
  return { slotId, type, date, startMin, endMin, capacity, display: slotId, location: '' };
}

// Mô phỏng LockService: các lượt đặt được serialize, mỗi lượt thấy state mới nhất.
function simulate(slots, initialRegs, attempts) {
  const regs = initialRegs.map((r) => ({ ...r }));
  const results = [];
  for (const a of attempts) {
    const ev = evaluateBooking_(slots, regs, a.payload, a.email);
    if (ev.ok) {
      const existing = regs.find((r) => r.email === a.email);
      if (existing) {
        existing.empCode = a.payload.empCode;
        existing.speakingSlotId = ev.sp.slotId;
        existing.skillsSlotId = ev.sk.slotId;
      } else {
        regs.push({
          email: a.email,
          empCode: a.payload.empCode,
          fullName: 'T', bu: 'BU',
          speakingSlotId: ev.sp.slotId,
          skillsSlotId: ev.sk.slotId,
          changeCount: 0,
        });
      }
    }
    results.push({ email: a.email, ok: ev.ok, code: ev.code });
  }
  return { regs, results };
}

test('capacity 5: 20 lượt đặt đồng thời cùng 1 ca → đúng 5 thành công, 15 SLOT_FULL', () => {
  const slots = [
    slot('SP1', 'Speaking', '2026-06-22', 540, 600, 5), // bottleneck
    slot('SK1', '3 Skills', '2026-06-22', 660, 780, 20),
  ];
  const attempts = Array.from({ length: 20 }, (_, i) => ({
    email: `u${i}@cyberlogitec.com`,
    payload: { empCode: String(100000 + i), speakingSlotId: 'SP1', skillsSlotId: 'SK1' },
  }));
  const { results, regs } = simulate(slots, [], attempts);
  assert.equal(results.filter((r) => r.ok).length, 5);
  assert.equal(results.filter((r) => r.code === 'SLOT_FULL').length, 15);
  assert.equal(countBooked_(regs, 'SP1', null), 5);
});

test('AC-03 — capacity 1: 5 lượt đồng thời → đúng 1 thành công, 4 SLOT_FULL', () => {
  const slots = [
    slot('SP1', 'Speaking', '2026-06-22', 540, 600, 1),
    slot('SK1', '3 Skills', '2026-06-22', 660, 780, 10),
  ];
  const attempts = Array.from({ length: 5 }, (_, i) => ({
    email: `u${i}@cyberlogitec.com`,
    payload: { empCode: String(200000 + i), speakingSlotId: 'SP1', skillsSlotId: 'SK1' },
  }));
  const { results, regs } = simulate(slots, [], attempts);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(results.filter((r) => r.code === 'SLOT_FULL').length, 4);
  assert.equal(countBooked_(regs, 'SP1', null), 1);
});

test('2 ca trùng giờ cùng ngày → SLOT_CONFLICT', () => {
  const slots = [
    slot('SP1', 'Speaking', '2026-06-22', 540, 600, 10), // 09:00–10:00
    slot('SK1', '3 Skills', '2026-06-22', 570, 690, 10), // 09:30–11:30 chồng giờ
  ];
  const ev = evaluateBooking_(slots, [], { empCode: '300000', speakingSlotId: 'SP1', skillsSlotId: 'SK1' }, 'a@cyberlogitec.com');
  assert.equal(ev.ok, false);
  assert.equal(ev.code, 'SLOT_CONFLICT');
});

test('speakingSlotId trỏ vào ca 3 Skills → INVALID_SPEAKING', () => {
  const slots = [
    slot('SK1', '3 Skills', '2026-06-22', 540, 660, 10),
    slot('SK2', '3 Skills', '2026-06-22', 720, 840, 10),
  ];
  const ev = evaluateBooking_(slots, [], { empCode: '400000', speakingSlotId: 'SK1', skillsSlotId: 'SK2' }, 'a@cyberlogitec.com');
  assert.equal(ev.ok, false);
  assert.equal(ev.code, 'INVALID_SPEAKING');
});

test('mã NV đã thuộc email khác → EMP_CODE_TAKEN (kiểm trước cả capacity)', () => {
  const slots = [
    slot('SP1', 'Speaking', '2026-06-22', 540, 600, 10),
    slot('SK1', '3 Skills', '2026-06-22', 660, 780, 10),
  ];
  const regs = [{ email: 'owner@cyberlogitec.com', empCode: '262010', speakingSlotId: 'SP1', skillsSlotId: 'SK1', changeCount: 0 }];
  const ev = evaluateBooking_(slots, regs, { empCode: '262010', speakingSlotId: 'SP1', skillsSlotId: 'SK1' }, 'intruder@cyberlogitec.com');
  assert.equal(ev.ok, false);
  assert.equal(ev.code, 'EMP_CODE_TAKEN');
  assert.equal(ev.takenBy, 'owner@cyberlogitec.com');
});

test('đổi ca: user giữ chỗ của chính mình (capacity 1) → không tự chặn', () => {
  const slots = [
    slot('SP1', 'Speaking', '2026-06-22', 540, 600, 1),
    slot('SK1', '3 Skills', '2026-06-22', 660, 780, 1),
    slot('SK2', '3 Skills', '2026-06-22', 800, 920, 1),
  ];
  const regs = [{ email: 'a@cyberlogitec.com', empCode: '262010', speakingSlotId: 'SP1', skillsSlotId: 'SK1', changeCount: 0 }];
  // a đổi SK1 → SK2 nhưng vẫn giữ SP1 (cap 1, đang do chính a chiếm) → phải OK.
  const ev = evaluateBooking_(slots, regs, { empCode: '262010', speakingSlotId: 'SP1', skillsSlotId: 'SK2' }, 'a@cyberlogitec.com');
  assert.equal(ev.ok, true);
  assert.equal(ev.sp.slotId, 'SP1');
  assert.equal(ev.sk.slotId, 'SK2');
});
