/**
 * Pure booking-decision logic — KHÔNG dùng SpreadsheetApp / Session / LockService ở đây.
 * Dùng chung cho server (Code.js, gọi trong critical section) và unit test
 * (tests/booking-core.test.mjs). Giữ thuần JS để test được trong Node mà không cần stub GAS.
 */

function countBooked_(regs, slotId, exceptEmail) {
  var n = 0;
  for (var i = 0; i < regs.length; i++) {
    if (exceptEmail && regs[i].email === exceptEmail) continue;
    if (regs[i].speakingSlotId === slotId || regs[i].skillsSlotId === slotId) n++;
  }
  return n;
}

/**
 * Kiểm tra hợp lệ 1 lượt đặt chỗ tại trạng thái hiện tại của `regs`.
 * PHẢI gọi sau khi đã giữ LockService để chống race capacity / emp_code.
 * @return { ok:true, sp, sk } | { ok:false, code, error, slotId?, takenBy? }
 */
function evaluateBooking_(slots, regs, payload, email) {
  payload = payload || {};
  var empCode = String(payload.empCode || '').trim();

  // Mã NV duy nhất — email khác không được claim trùng (kể cả dòng đã hủy vẫn giữ mã).
  for (var ui = 0; ui < regs.length; ui++) {
    if (regs[ui].empCode === empCode && regs[ui].email !== email) {
      return {
        ok: false,
        code: 'EMP_CODE_TAKEN',
        takenBy: regs[ui].email,
        error: 'Mã NV ' + empCode + ' đã được đăng ký bởi tài khoản khác. Vui lòng kiểm tra lại hoặc liên hệ Ban tổ chức.',
      };
    }
  }

  var byId = {};
  for (var si = 0; si < slots.length; si++) byId[slots[si].slotId] = slots[si];
  var sp = byId[String(payload.speakingSlotId || '')];
  var sk = byId[String(payload.skillsSlotId || '')];
  if (!sp || sp.type !== 'Speaking')
    return { ok: false, code: 'INVALID_SPEAKING', error: 'Ca Speaking không hợp lệ.' };
  if (!sk || sk.type !== '3 Skills')
    return { ok: false, code: 'INVALID_SKILLS', error: 'Ca 3 Skills không hợp lệ.' };

  // Còn chỗ — loại trừ booking cũ của chính HV để cho phép đổi ca trong slot mình đang giữ.
  if (countBooked_(regs, sp.slotId, email) >= sp.capacity)
    return { ok: false, code: 'SLOT_FULL', slotId: sp.slotId, error: 'Ca Speaking "' + sp.display + '" đã hết chỗ.' };
  if (countBooked_(regs, sk.slotId, email) >= sk.capacity)
    return { ok: false, code: 'SLOT_FULL', slotId: sk.slotId, error: 'Ca 3 Skills "' + sk.display + '" đã hết chỗ.' };

  // Không trùng giờ nếu cùng ngày.
  if (sp.date === sk.date && sp.startMin < sk.endMin && sp.endMin > sk.startMin)
    return { ok: false, code: 'SLOT_CONFLICT', error: 'Hai ca thi bị trùng giờ. Vui lòng chọn 2 ca không trùng.' };

  return { ok: true, sp: sp, sk: sk };
}
