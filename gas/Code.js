/**
 * Assessment Booking Q2 2026 — server (Apps Script).
 * Web app deployed as USER_ACCESSING, domain-restricted to @cyberlogitec.com.
 *
 * Sheets: Slots, Registrations, Config, Eligibility (optional), AuditLog
 */

const SHEETS = {
  SLOTS: 'Slots',
  REGS: 'Registrations',
  CONFIG: 'Config',
  ELIGIBILITY: 'Eligibility',
  AUDIT_LOG: 'AuditLog',
};

// ── helpers ──────────────────────────────────────────────────────────────

function tz_() { return Session.getScriptTimeZone(); }

function toMin_(v) {
  if (v instanceof Date) return v.getUTCHours() * 60 + v.getUTCMinutes();
  if (typeof v === 'number') return Math.round(v * 1440); // fraction of day
  if (typeof v === 'string') {
    const m = v.match(/(\d{1,2}):(\d{2})/);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
  }
  return 0;
}

function fmtDate_(v) {
  return Utilities.formatDate(new Date(v), tz_(), 'yyyy-MM-dd');
}

function fmtTime_(v) {
  if (v instanceof Date) {
    const h = v.getUTCHours();
    const m = v.getUTCMinutes();
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  const total = toMin_(v);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function display_(type, date, start, end, location) {
  const dd = Utilities.formatDate(new Date(date), tz_(), 'dd/MM');
  let s = type + ' | ' + dd + ' | ' + fmtTime_(start) + '–' + fmtTime_(end);
  if (location) s += ' | ' + location;
  return s;
}

function getSheet_(name) {
  const ss = SpreadsheetApp.getActive();
  if (!ss) throw new Error('Script chưa được bind vào Google Sheet.');
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Không tìm thấy sheet "' + name + '". Vui lòng tạo sheet này.');
  return sh;
}

/** Kiểm tra header row khớp với expected (ít nhất). Extra columns OK. */
function assertHeaders_(sh, expected) {
  if (sh.getLastRow() === 0) return; // empty sheet, skip
  const headers = (sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), expected.length)).getValues()[0] || [])
    .map(function (h) { return String(h).toLowerCase().trim(); });
  for (let i = 0; i < expected.length; i++) {
    if (headers[i] !== expected[i]) {
      throw new Error(
        'Sheet "' + sh.getName() + '" header sai cột ' + (i + 1) +
        ': kỳ vọng "' + expected[i] + '", thực tế "' + (headers[i] || '(trống)') + '". ' +
        'Vui lòng không đổi thứ tự cột.'
      );
    }
  }
}

function getUserEmail_() {
  var email = (Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!email) {
    throw new Error(
      'Không xác định được email. Đảm bảo bạn đăng nhập bằng tài khoản công ty đúng domain.'
    );
  }
  if (!email.endsWith('@cyberlogitec.com')) {
    throw new Error(
      'Chỉ tài khoản @cyberlogitec.com được phép truy cập hệ thống.'
    );
  }
  return email;
}

// ── sheet readers ────────────────────────────────────────────────────────

function readSlots_() {
  var sh = getSheet_(SHEETS.SLOTS);
  assertHeaders_(sh, ['slot_id', 'type', 'date', 'session', 'start_time', 'end_time', 'capacity']);
  var rows = sh.getDataRange().getValues().slice(1);
  return rows.filter(function (r) { return r[0]; }).map(function (r) {
    var loc = r.length > 7 ? String(r[7] || '').trim() : '';
    return {
      slotId: String(r[0]).trim(),
      type: String(r[1]).trim(),
      date: fmtDate_(r[2]),
      session: String(r[3] || '').trim(),
      startMin: toMin_(r[4]),
      endMin: toMin_(r[5]),
      capacity: Number(r[6]) || 0,
      location: loc,
      display: display_(String(r[1]).trim(), r[2], r[4], r[5], loc),
    };
  });
}

function readRegs_() {
  var sh = getSheet_(SHEETS.REGS);
  assertHeaders_(sh, ['email', 'emp_code', 'full_name', 'bu', 'speaking_slot_id', 'skills_slot_id']);
  var all = sh.getDataRange().getValues();
  var headers = all[0] || [];
  // Detect format: 8-col with created_at at 6, 9-col with change_count at 8
  var hasCreatedAt = String(headers[6] || '').toLowerCase().trim() === 'created_at';
  var hasChangeCount = String(headers[8] || '').toLowerCase().trim() === 'change_count';
  var rows = all.slice(1);
  return rows.filter(function (r) { return r[0]; }).map(function (r) {
    return {
      email: String(r[0]).toLowerCase().trim(),
      empCode: String(r[1] || '').trim(),
      fullName: String(r[2] || '').trim(),
      bu: String(r[3] || '').trim(),
      speakingSlotId: r[4] ? String(r[4]).trim() : null,
      skillsSlotId: r[5] ? String(r[5]).trim() : null,
      createdAt: hasCreatedAt ? (r[6] || null) : null,
      updatedAt: r[hasCreatedAt ? 7 : 6] || null,
      changeCount: hasChangeCount ? Number(r[8] || 0) : 0,
    };
  });
}

function readConfig_() {
  var cfg = { deadline: null, emailConfirm: false, adminEmails: '', allowEnrollment: true, maxChanges: 3 };
  var ss = SpreadsheetApp.getActive();
  var sh = ss && ss.getSheetByName(SHEETS.CONFIG);
  if (!sh) return cfg;
  var rows = sh.getDataRange().getValues().slice(1);
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var key = String(r[0] || '').trim();
    var val = r[1];
    if (key === 'deadline' && val) {
      cfg.deadline = val instanceof Date ? val : new Date(val);
    } else if (key === 'email_confirm') {
      cfg.emailConfirm = val === true || String(val).toUpperCase() === 'TRUE';
    } else if (key === 'admin_email') {
      cfg.adminEmails = String(val || '').trim();
    } else if (key === 'max_changes') {
      cfg.maxChanges = Number(val) || 3;
    } else if (key === 'allow_enrollment') {
      cfg.allowEnrollment = String(val).toUpperCase() === 'TRUE';
    }
  }
  return cfg;
}

/**
 * Đọc eligibility list. Trả [] nếu sheet không tồn tại (backward compatible).
 * Nếu sheet tồn tại và có data → chỉ email trong list mới được đăng ký.
 */
function readEligibility_() {
  var ss = SpreadsheetApp.getActive();
  if (!ss) return [];
  var sh = ss.getSheetByName(SHEETS.ELIGIBILITY);
  if (!sh) return []; // No sheet = no restriction
  var rows = sh.getDataRange().getValues().slice(1);
  return rows.filter(function (r) { return r[0]; }).map(function (r) {
    return {
      email: String(r[0]).toLowerCase().trim(),
      fullName: String(r[1] || '').trim(),
      bu: String(r[2] || '').trim(),
      empCode: String(r[3] || '').trim(),
    };
  });
}

function countBooked_(regs, slotId, exceptEmail) {
  var n = 0;
  for (var i = 0; i < regs.length; i++) {
    if (exceptEmail && regs[i].email === exceptEmail) continue;
    if (regs[i].speakingSlotId === slotId || regs[i].skillsSlotId === slotId) n++;
  }
  return n;
}

function buildState_(email, slots, regs, cfg) {
  var mine = null;
  for (var i = 0; i < regs.length; i++) {
    if (regs[i].email === email) { mine = regs[i]; break; }
  }
  var now = new Date();
  return {
    email: email,
    myBooking: mine ? {
      empCode: mine.empCode,
      fullName: mine.fullName,
      bu: mine.bu,
      speakingSlotId: mine.speakingSlotId,
      skillsSlotId: mine.skillsSlotId,
      createdAt: mine.createdAt ? new Date(mine.createdAt).toISOString() : null,
      updatedAt: mine.updatedAt ? new Date(mine.updatedAt).toISOString() : null,
      changeCount: typeof mine.changeCount === 'number' ? mine.changeCount : 0,
    } : null,
    maxChanges: cfg.maxChanges || 3,
    slots: slots.map(function (s) {
      return {
        slotId: s.slotId,
        type: s.type,
        date: s.date,
        session: s.session,
        startMin: s.startMin,
        endMin: s.endMin,
        capacity: s.capacity,
        location: s.location || '',
        remaining: Math.max(0, s.capacity - countBooked_(regs, s.slotId, null)),
        display: s.display,
      };
    }),
    deadline: cfg.deadline ? cfg.deadline.toISOString() : null,
    deadlinePassed: !!cfg.deadline && now > cfg.deadline,
    allowEnrollment: cfg.allowEnrollment !== false,
    serverNow: now.toISOString(),
  };
}

// ── audit log (persistent) ───────────────────────────────────────────────

/**
 * Ghi audit event vào console.log VÀ sheet AuditLog (nếu tồn tại).
 * Không bao giờ block booking nếu log fail.
 */
function audit_(event, email, detail) {
  var now = new Date();
  var detailJson = '';
  try { detailJson = detail ? JSON.stringify(detail) : ''; } catch (e) { /* ignore */ }

  // 1. Console log (always)
  try {
    console.log(JSON.stringify({
      event: event,
      email: email,
      at: now.toISOString(),
      detail: detail || null,
    }));
  } catch (e) { /* never block */ }

  // 2. Sheet log (if AuditLog sheet exists)
  try {
    var ss = SpreadsheetApp.getActive();
    var sh = ss && ss.getSheetByName(SHEETS.AUDIT_LOG);
    if (sh) {
      sh.appendRow([
        now,          // timestamp
        email,        // email
        event,        // event
        detail && detail.empCode ? detail.empCode : '',
        detail && detail.fullName ? detail.fullName : '',
        detail && detail.bu ? detail.bu : '',
        detail && detail.sp ? detail.sp : '',
        detail && detail.sk ? detail.sk : '',
        detail && detail.prevSp ? detail.prevSp : '',
        detail && detail.prevSk ? detail.prevSk : '',
        detailJson,   // raw detail JSON
      ]);
    }
  } catch (e) {
    console.warn('audit_ sheet write failed: ' + e);
  }
}

// ── client-callable functions ────────────────────────────────────────────

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Đăng ký thi Assessment Q2 2026')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function init() {
  var email = getUserEmail_();
  return buildState_(email, readSlots_(), readRegs_(), readConfig_());
}

function book(payload) {
  var email;
  try { email = getUserEmail_(); }
  catch (e) { return { ok: false, error: e.message || String(e) }; }

  payload = payload || {};
  var empCode = String(payload.empCode || '').trim();
  var fullName = String(payload.fullName || '').trim();
  var bu = String(payload.bu || '').trim();
  if (!empCode || !fullName || !bu)
    return { ok: false, error: 'Vui lòng điền đầy đủ Mã NV, Họ và tên, BU.' };
  if (empCode.length > 20 || fullName.length > 100 || bu.length > 50)
    return { ok: false, error: 'Dữ liệu nhập quá dài. Mã NV tối đa 20 ký tự, Họ tên tối đa 100, BU tối đa 50.' };

  // ── allowEnrollment check (before lock) ──
  try {
    var earlyCfg = readConfig_();
    if (earlyCfg.allowEnrollment === false) {
      return { ok: false, error: 'Đăng ký hiện đang bị khoá. Vui lòng liên hệ Ban tổ chức.' };
    }
  } catch (e) { /* will re-check inside lock */ }

  // ── Eligibility check (before lock) ──
  var eligibility = readEligibility_();
  if (eligibility.length > 0) {
    var eligible = null;
    for (var ei = 0; ei < eligibility.length; ei++) {
      if (eligibility[ei].email === email) { eligible = eligibility[ei]; break; }
    }
    if (!eligible) {
      audit_('book.rejected.not_eligible', email, {});
      return { ok: false, error: 'Bạn không nằm trong danh sách đăng ký thi. Vui lòng liên hệ Ban tổ chức.' };
    }
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { ok: false, error: 'Hệ thống đang bận, vui lòng thử lại sau vài giây.' };
  }

  try {
    // Re-read config inside lock to prevent TOCTOU race on deadline
    var cfg;
    try { cfg = readConfig_(); }
    catch (e) { return { ok: false, error: e.message || String(e) }; }

    if (cfg.deadline && new Date() > cfg.deadline) {
      audit_('book.rejected.deadline', email, {});
      return { ok: false, error: 'Đã hết hạn đăng ký.' };
    }

    var slots = readSlots_();
    var regs = readRegs_();
    var byId = {};
    for (var si = 0; si < slots.length; si++) byId[slots[si].slotId] = slots[si];

    var sp = byId[String(payload.speakingSlotId || '')];
    var sk = byId[String(payload.skillsSlotId || '')];
    if (!sp || sp.type !== 'Speaking')
      return { ok: false, error: 'Ca Speaking không hợp lệ.' };
    if (!sk || sk.type !== '3 Skills')
      return { ok: false, error: 'Ca 3 Skills không hợp lệ.' };

    // Cổng 1: còn chỗ (loại trừ booking cũ của chính HV).
    if (countBooked_(regs, sp.slotId, email) >= sp.capacity)
      return { ok: false, error: 'Ca Speaking "' + sp.display + '" đã hết chỗ.', state: buildState_(email, slots, regs, cfg) };
    if (countBooked_(regs, sk.slotId, email) >= sk.capacity)
      return { ok: false, error: 'Ca 3 Skills "' + sk.display + '" đã hết chỗ.', state: buildState_(email, slots, regs, cfg) };

    // Cổng 2: tự thỏa (1 SP + 1 SK do 2 trường riêng biệt).

    // Cổng 3: không overlap nếu cùng ngày.
    if (sp.date === sk.date && sp.startMin < sk.endMin && sp.endMin > sk.startMin)
      return { ok: false, error: 'Hai ca thi bị trùng giờ. Vui lòng chọn 2 ca không trùng.' };

    // Detect Registrations sheet format
    var sh = getSheet_(SHEETS.REGS);
    var all = sh.getDataRange().getValues();
    var headers = all[0] || [];
    var hasCreatedAt = String(headers[6] || '').toLowerCase().trim() === 'created_at';
    var hasChangeCount = String(headers[8] || '').toLowerCase().trim() === 'change_count';

    // Upsert theo email.
    var rowIdx = -1;
    var oldRow = null;
    for (var ri = 1; ri < all.length; ri++) {
      if (String(all[ri][0]).toLowerCase().trim() === email) {
        rowIdx = ri + 1;
        oldRow = all[ri];
        break;
      }
    }
    var now = new Date();

    // ── Change limit check ──
    if (oldRow) {
      var maxChanges = cfg.maxChanges || 3;
      var currentChangeCount = hasChangeCount ? Number(oldRow[8] || 0) : 0;
      if (currentChangeCount >= maxChanges) {
        audit_('book.rejected.change_limit', email, {
          empCode: empCode, fullName: fullName, bu: bu,
          sp: sp.slotId, sk: sk.slotId, changeCount: currentChangeCount,
        });
        return { ok: false, error: 'Bạn đã đổi ca ' + currentChangeCount + ' lần (tối đa ' + maxChanges + ' lần). Vui lòng liên hệ Ban tổ chức nếu cần đổi thêm.' };
      }
    }

    // Build row based on sheet format
    var changeCount = oldRow && hasChangeCount ? Number(oldRow[8] || 0) + 1 : (oldRow ? 1 : 0);
    var row;
    if (hasCreatedAt && hasChangeCount) {
      var createdAt = (oldRow && oldRow[6]) ? oldRow[6] : now;
      row = [email, empCode, fullName, bu, sp.slotId, sk.slotId, createdAt, now, changeCount];
    } else if (hasCreatedAt) {
      var createdAt = (oldRow && oldRow[6]) ? oldRow[6] : now;
      row = [email, empCode, fullName, bu, sp.slotId, sk.slotId, createdAt, now];
    } else {
      row = [email, empCode, fullName, bu, sp.slotId, sk.slotId, now];
    }

    if (rowIdx === -1) sh.appendRow(row);
    else sh.getRange(rowIdx, 1, 1, row.length).setValues([row]);
    SpreadsheetApp.flush();

    audit_(oldRow ? 'book.update' : 'book.create', email, {
      empCode: empCode,
      fullName: fullName,
      bu: bu,
      sp: sp.slotId,
      sk: sk.slotId,
      prevSp: oldRow ? String(oldRow[4] || '') : null,
      prevSk: oldRow ? String(oldRow[5] || '') : null,
      changeCount: changeCount,
    });

    var emailSent = false;
    if (cfg.emailConfirm) {
      try { sendConfirmEmail_(email, fullName, sp, sk, empCode, bu); emailSent = true; }
      catch (e) { console.warn('sendConfirmEmail failed: ' + e); }
    }

    // Trả về state đã đồng bộ với booking mới
    var freshRegs = readRegs_();
    return { ok: true, emailSent: emailSent, state: buildState_(email, slots, freshRegs, cfg) };
  } finally {
    lock.releaseLock();
  }
}

function cancel() {
  var email;
  try { email = getUserEmail_(); }
  catch (e) { return { ok: false, error: e.message || String(e) }; }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); }
  catch (e) { return { ok: false, error: 'Hệ thống đang bận, vui lòng thử lại.' }; }

  try {
    // Re-read config inside lock to prevent TOCTOU race on deadline
    var cfg;
    try { cfg = readConfig_(); }
    catch (e) { return { ok: false, error: e.message || String(e) }; }

    if (cfg.deadline && new Date() > cfg.deadline)
      return { ok: false, error: 'Đã hết hạn đăng ký. Không thể hủy.' };

    var sh = getSheet_(SHEETS.REGS);
    var all = sh.getDataRange().getValues();
    var rowIdx = -1;
    var oldRow = null;
    for (var i = 1; i < all.length; i++) {
      if (String(all[i][0]).toLowerCase().trim() === email) {
        rowIdx = i + 1;
        oldRow = all[i];
        break;
      }
    }
    if (rowIdx === -1) return { ok: false, error: 'Bạn chưa có đăng ký nào để hủy.' };
    sh.deleteRow(rowIdx);
    SpreadsheetApp.flush();

    audit_('cancel', email, oldRow ? {
      empCode: String(oldRow[1] || ''),
      fullName: String(oldRow[2] || ''),
      bu: String(oldRow[3] || ''),
      sp: String(oldRow[4] || ''),
      sk: String(oldRow[5] || ''),
    } : null);

    return { ok: true, state: buildState_(email, readSlots_(), readRegs_(), cfg) };
  } finally {
    lock.releaseLock();
  }
}

function sendConfirmEmail_(email, fullName, sp, sk, empCode, bu) {
  var subject = 'Xác nhận đăng ký Assessment Q2 2026';
  var ss = SpreadsheetApp.getActive();
  var url = ss ? ss.getUrl() : '';
  var spLoc = sp.location ? ' · 📍 ' + sp.location : '';
  var skLoc = sk.location ? ' · 📍 ' + sk.location : '';
  var body =
    'Xin chào ' + fullName + ',\n\n' +
    'Bạn đã đăng ký thành công 2 ca thi Assessment Q2 2026:\n\n' +
    '  Mã NV: ' + empCode + '\n' +
    '  Họ tên: ' + fullName + '\n' +
    '  BU: ' + bu + '\n\n' +
    '  • Speaking: ' + sp.display + spLoc + '\n' +
    '  • 3 Skills: ' + sk.display + skLoc + '\n\n' +
    'Trước hạn đăng ký, bạn có thể vào lại link để xem, đổi ca (tối đa 3 lần), hoặc hủy.\n' +
    (url ? 'Link: ' + url + '\n' : '') +
    '\n--\nThông điệp tự động — vui lòng không trả lời email này.';
  MailApp.sendEmail({ to: email, subject: subject, body: body });
}

// ── admin: refresh summary sheet ─────────────────────────────────────────

/**
 * Tạo/cập nhật sheet AdminSummary với tổng quan đăng ký.
 * Chạy từ Apps Script editor hoặc trigger.
 */
function refreshAdminSummary() {
  var ss = SpreadsheetApp.getActive();
  if (!ss) throw new Error('No active spreadsheet');

  var slots = readSlots_();
  var regs = readRegs_();
  var eligibility = readEligibility_();

  // Get or create AdminSummary sheet
  var sh = ss.getSheetByName('AdminSummary');
  if (!sh) sh = ss.insertSheet('AdminSummary');
  sh.clear();

  var row = 1;

  // Overview
  sh.getRange(row, 1).setValue('ASSESSMENT BOOKING Q2 2026 — ADMIN SUMMARY');
  sh.getRange(row, 1).setFontWeight('bold').setFontSize(14);
  row += 2;

  sh.getRange(row, 1).setValue('Generated: ' + Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm:ss'));
  row += 2;

  // Stats
  var registeredEmails = {};
  for (var i = 0; i < regs.length; i++) registeredEmails[regs[i].email] = true;
  var notRegistered = [];
  if (eligibility.length > 0) {
    for (var j = 0; j < eligibility.length; j++) {
      if (!registeredEmails[eligibility[j].email]) notRegistered.push(eligibility[j]);
    }
  }

  sh.getRange(row, 1).setValue('OVERVIEW').setFontWeight('bold').setFontSize(12);
  row++;
  var overviewData = [
    ['Metric', 'Value'],
    ['Total eligible', eligibility.length > 0 ? eligibility.length : '(no Eligibility sheet)'],
    ['Registered', regs.length],
    ['Not registered', eligibility.length > 0 ? notRegistered.length : '(need Eligibility sheet)'],
  ];
  sh.getRange(row, 1, overviewData.length, 2).setValues(overviewData);
  sh.getRange(row, 1, 1, 2).setFontWeight('bold');
  row += overviewData.length + 1;

  // Slot summary
  sh.getRange(row, 1).setValue('SLOT SUMMARY').setFontWeight('bold').setFontSize(12);
  row++;
  var slotHeaders = ['Slot ID', 'Type', 'Date', 'Time', 'Location', 'Capacity', 'Booked', 'Remaining', 'Status'];
  sh.getRange(row, 1, 1, slotHeaders.length).setValues([slotHeaders]).setFontWeight('bold');
  row++;

  for (var si = 0; si < slots.length; si++) {
    var s = slots[si];
    var booked = countBooked_(regs, s.slotId, null);
    var remaining = Math.max(0, s.capacity - booked);
    var status = remaining <= 0 ? '🔴 FULL' : (remaining <= Math.max(2, Math.floor(s.capacity * 0.25)) ? '🟡 LOW' : '🟢 OK');
    sh.getRange(row, 1, 1, slotHeaders.length).setValues([[
      s.slotId, s.type, s.date,
      fmtTime_(s.startMin) + '–' + fmtTime_(s.endMin),
      s.location || '',
      s.capacity, booked, remaining, status,
    ]]);
    row++;
  }
  row++;

  // Registered list
  sh.getRange(row, 1).setValue('ALL REGISTERED').setFontWeight('bold').setFontSize(12);
  row++;
  var regHeaders = ['Email', 'Emp Code', 'Full Name', 'BU', 'Speaking Slot', 'Skills Slot', 'Created', 'Updated'];
  sh.getRange(row, 1, 1, regHeaders.length).setValues([regHeaders]).setFontWeight('bold');
  row++;
  for (var ri = 0; ri < regs.length; ri++) {
    var r = regs[ri];
    sh.getRange(row, 1, 1, regHeaders.length).setValues([[
      r.email, r.empCode, r.fullName, r.bu,
      r.speakingSlotId || '', r.skillsSlotId || '',
      r.createdAt ? new Date(r.createdAt).toLocaleString('vi-VN') : '',
      r.updatedAt ? new Date(r.updatedAt).toLocaleString('vi-VN') : '',
    ]]);
    row++;
  }
  row++;

  // Not registered list (only if eligibility exists)
  if (eligibility.length > 0 && notRegistered.length > 0) {
    sh.getRange(row, 1).setValue('NOT REGISTERED (cần nhắc nhở)').setFontWeight('bold').setFontSize(12);
    sh.getRange(row, 1).setBackground('#fff3cd');
    row++;
    var nrHeaders = ['Email', 'Full Name', 'BU', 'Emp Code'];
    sh.getRange(row, 1, 1, nrHeaders.length).setValues([nrHeaders]).setFontWeight('bold');
    row++;
    for (var ni = 0; ni < notRegistered.length; ni++) {
      var nr = notRegistered[ni];
      sh.getRange(row, 1, 1, nrHeaders.length).setValues([[nr.email, nr.fullName, nr.bu, nr.empCode]]);
      row++;
    }
    row++;
  }

  // Auto-resize columns
  for (var ci = 1; ci <= 9; ci++) sh.autoResizeColumn(ci);

  SpreadsheetApp.flush();
  return 'AdminSummary refreshed: ' + regs.length + ' registered, ' + notRegistered.length + ' not registered.';
}

// ── admin: sanity check (chạy thủ công từ Apps Script editor) ────────────

/**
 * Chạy từ Apps Script editor để kiểm tra sheet sanity.
 * Output trong View → Logs. Cũng ghi ra sheet AdminSummary nếu muốn.
 */
function lint() {
  var issues = [];
  var slots = readSlots_();
  var regs = readRegs_();
  var cfg = readConfig_();
  var eligibility = readEligibility_();

  // 1. Duplicate slot_id
  var seenIds = {};
  for (var i = 0; i < slots.length; i++) {
    if (seenIds[slots[i].slotId]) issues.push('Duplicate slot_id: ' + slots[i].slotId);
    seenIds[slots[i].slotId] = true;
  }

  // 2. Type không hợp lệ
  for (var i2 = 0; i2 < slots.length; i2++) {
    var s = slots[i2];
    if (s.type !== 'Speaking' && s.type !== '3 Skills')
      issues.push('Slot ' + s.slotId + ': type không hợp lệ ("' + s.type + '"). Phải là "Speaking" hoặc "3 Skills".');
    if (s.capacity <= 0)
      issues.push('Slot ' + s.slotId + ': capacity = ' + s.capacity);
    if (s.startMin >= s.endMin)
      issues.push('Slot ' + s.slotId + ': start_time >= end_time');
  }

  // 3. Orphan registrations
  var slotIds = {};
  for (var i3 = 0; i3 < slots.length; i3++) slotIds[slots[i3].slotId] = slots[i3];
  for (var i4 = 0; i4 < regs.length; i4++) {
    var r = regs[i4];
    if (r.speakingSlotId && !slotIds[r.speakingSlotId])
      issues.push('Reg ' + r.email + ': speaking_slot_id "' + r.speakingSlotId + '" không tồn tại.');
    if (r.skillsSlotId && !slotIds[r.skillsSlotId])
      issues.push('Reg ' + r.email + ': skills_slot_id "' + r.skillsSlotId + '" không tồn tại.');
    if (r.speakingSlotId && slotIds[r.speakingSlotId] && slotIds[r.speakingSlotId].type !== 'Speaking')
      issues.push('Reg ' + r.email + ': speaking_slot_id "' + r.speakingSlotId + '" không phải type Speaking.');
    if (r.skillsSlotId && slotIds[r.skillsSlotId] && slotIds[r.skillsSlotId].type !== '3 Skills')
      issues.push('Reg ' + r.email + ': skills_slot_id "' + r.skillsSlotId + '" không phải type 3 Skills.');
  }

  // 4. Booked > capacity
  for (var i5 = 0; i5 < slots.length; i5++) {
    var sl = slots[i5];
    var booked = countBooked_(regs, sl.slotId, null);
    if (booked > sl.capacity)
      issues.push('Slot ' + sl.slotId + ': booked ' + booked + ' > capacity ' + sl.capacity);
  }

  // 5. User có booking nhưng 2 ca trùng giờ
  for (var i6 = 0; i6 < regs.length; i6++) {
    var rg = regs[i6];
    if (!rg.speakingSlotId || !rg.skillsSlotId) continue;
    var sp = slotIds[rg.speakingSlotId], sk = slotIds[rg.skillsSlotId];
    if (sp && sk && sp.date === sk.date && sp.startMin < sk.endMin && sp.endMin > sk.startMin)
      issues.push('Reg ' + rg.email + ': 2 ca trùng giờ (' + sp.display + ' & ' + sk.display + ').');
  }

  // 6. Email trùng (duplicate registrations)
  var emailCount = {};
  for (var i7 = 0; i7 < regs.length; i7++) emailCount[regs[i7].email] = (emailCount[regs[i7].email] || 0) + 1;
  for (var e in emailCount) {
    if (emailCount[e] > 1)
      issues.push('Email "' + e + '" có ' + emailCount[e] + ' dòng (đáng ra chỉ 1).');
  }

  // 7. Config
  if (!cfg.deadline) issues.push('Config: thiếu key "deadline" hoặc giá trị rỗng.');

  // 8. Registered but not eligible (only if eligibility exists)
  if (eligibility.length > 0) {
    var eligibleMap = {};
    for (var ei = 0; ei < eligibility.length; ei++) eligibleMap[eligibility[ei].email] = true;
    for (var ri2 = 0; ri2 < regs.length; ri2++) {
      if (!eligibleMap[regs[ri2].email])
        issues.push('Reg ' + regs[ri2].email + ': đã đăng ký nhưng không trong danh sách Eligibility.');
    }
  }

  // 9. Empty required fields
  for (var ri3 = 0; ri3 < regs.length; ri3++) {
    var rg2 = regs[ri3];
    if (!rg2.empCode) issues.push('Reg ' + rg2.email + ': thiếu emp_code.');
    if (!rg2.fullName) issues.push('Reg ' + rg2.email + ': thiếu full_name.');
    if (!rg2.bu) issues.push('Reg ' + rg2.email + ': thiếu bu.');
    if (!rg2.speakingSlotId) issues.push('Reg ' + rg2.email + ': thiếu speaking_slot_id.');
    if (!rg2.skillsSlotId) issues.push('Reg ' + rg2.email + ': thiếu skills_slot_id.');
  }

  // 10. change_count sanity
  if (cfg.maxChanges) {
    for (var ri4 = 0; ri4 < regs.length; ri4++) {
      if (regs[ri4].changeCount < 0)
        issues.push('Reg ' + regs[ri4].email + ': change_count âm (' + regs[ri4].changeCount + ').');
      if (regs[ri4].changeCount > cfg.maxChanges + 5)
        issues.push('Reg ' + regs[ri4].email + ': change_count bất thường (' + regs[ri4].changeCount + ') so với max_changes (' + cfg.maxChanges + ').');
    }
  }

  var summary = '=== LINT REPORT ===\n' +
    'Slots: ' + slots.length + ' | Regs: ' + regs.length +
    ' | Eligible: ' + (eligibility.length > 0 ? eligibility.length : '(none)') +
    ' | Deadline: ' + (cfg.deadline ? cfg.deadline.toISOString() : '(none)') +
    ' | Email confirm: ' + cfg.emailConfirm + '\n' +
    (issues.length === 0 ? '✓ Không có lỗi.' : 'Có ' + issues.length + ' lỗi:\n  • ' + issues.join('\n  • '));
  console.log(summary);
  return summary;
}

// ── admin: export summary (text) ─────────────────────────────────────────

/**
 * Xuất danh sách đăng ký dạng bảng text để copy vào email/in.
 * Chạy từ Apps Script editor → View → Logs.
 */
function adminExportSummary() {
  var slots = readSlots_();
  var regs = readRegs_();
  var byId = {};
  for (var i = 0; i < slots.length; i++) byId[slots[i].slotId] = slots[i];

  var lines = [];
  lines.push('=== DANH SÁCH ĐĂNG KÝ ASSESSMENT Q2 2026 ===');
  lines.push('Tổng: ' + regs.length + ' học viên');
  lines.push('');
  lines.push([
    'Email',
    'Mã NV',
    'Họ tên',
    'BU',
    'Speaking (ngày giờ phòng)',
    '3 Skills (ngày giờ phòng)',
  ].join('\t'));

  for (var i = 0; i < regs.length; i++) {
    var r = regs[i];
    var sp = r.speakingSlotId ? byId[r.speakingSlotId] : null;
    var sk = r.skillsSlotId ? byId[r.skillsSlotId] : null;
    lines.push([
      r.email,
      r.empCode,
      r.fullName,
      r.bu,
      sp ? sp.display : '(trống)',
      sk ? sk.display : '(trống)',
    ].join('\t'));
  }

  var text = lines.join('\n');
  console.log(text);
  return text;
}

// ── admin: slot detail ───────────────────────────────────────────────────

/**
 * Trả về danh sách HV đã đăng ký vào 1 slot cụ thể.
 * Gọi từ Apps Script editor: adminSlotDetail('SP-2206-1330')
 */
function adminSlotDetail(slotId) {
  if (!slotId) return 'Cần truyền slotId. VD: adminSlotDetail("SP-2206-1330")';

  var slots = readSlots_();
  var regs = readRegs_();

  var slot = null;
  for (var i = 0; i < slots.length; i++) {
    if (slots[i].slotId === slotId) { slot = slots[i]; break; }
  }
  if (!slot) return 'Slot "' + slotId + '" không tồn tại.';

  var inSlot = [];
  for (var j = 0; j < regs.length; j++) {
    if (regs[j].speakingSlotId === slotId || regs[j].skillsSlotId === slotId) {
      inSlot.push(regs[j]);
    }
  }

  var type = '';
  for (var k = 0; k < regs.length; k++) {
    if (regs[k].speakingSlotId === slotId) { type = 'Speaking'; break; }
    if (regs[k].skillsSlotId === slotId) { type = '3 Skills'; break; }
  }

  var lines = [];
  lines.push('=== SLOT: ' + slotId + ' ===');
  lines.push(slot.display + ' | Capacity: ' + slot.capacity + ' | Booked: ' + inSlot.length + ' | Remaining: ' + Math.max(0, slot.capacity - inSlot.length));
  lines.push('');

  if (inSlot.length === 0) {
    lines.push('(Chưa ai đăng ký)');
  } else {
    lines.push(['#', 'Email', 'Mã NV', 'Họ tên', 'BU'].join('\t'));
    for (var m = 0; m < inSlot.length; m++) {
      var r = inSlot[m];
      lines.push([m + 1, r.email, r.empCode, r.fullName, r.bu].join('\t'));
    }
  }

  var text = lines.join('\n');
  console.log(text);
  return text;
}
