// Build iCalendar (.ics) cho 2 ca thi của 1 người đăng ký.
// Giờ slot là local Asia/Ho_Chi_Minh (UTC+7 cố định, không DST) → emit dạng UTC.
// SYNC: logic phải khớp src/lib/ics.ts (bản TS cho nút tải trên success screen).
const VN_OFFSET_MIN = 7 * 60;

function pad(n) { return String(n).padStart(2, '0'); }

function fmtUtc(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
    + `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

// date 'YYYY-MM-DD' + phút-từ-nửa-đêm (local) → 'YYYYMMDDTHHMMSSZ' (UTC)
function toIcsUtc(date, minLocal) {
  const [y, mo, d] = date.split('-').map(Number);
  return fmtUtc(Date.UTC(y, mo - 1, d) + (minLocal - VN_OFFSET_MIN) * 60000);
}

function escapeText(s) {
  return String(s)
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function vevent({ uid, sequence, stamp, summary, location, description, date, startMin, endMin }) {
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toIcsUtc(date, startMin)}`,
    `DTEND:${toIcsUtc(date, endMin)}`,
    `SUMMARY:${escapeText(summary)}`,
    location ? `LOCATION:${escapeText(location)}` : null,
    `DESCRIPTION:${escapeText(description)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Nhắc lịch thi (1 ngày trước)', 'TRIGGER:-P1D', 'END:VALARM',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Nhắc lịch thi (1 giờ trước)', 'TRIGGER:-PT1H', 'END:VALARM',
    'END:VEVENT',
  ].filter(Boolean);
}

// opts: { empCode, sp, sk, sequence, assessmentName, now? }
// sp/sk: { type, date, startMin, endMin, location }
function buildBookingIcs({ empCode, sp, sk, sequence, assessmentName, now = new Date() }) {
  const stamp = fmtUtc(now.getTime());
  const seq = Number.isFinite(sequence) && sequence >= 0 ? sequence : 0;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//Assessment Booking//Corgi7//VI', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    ...vevent({
      uid: `${empCode}-SP@assessment-booking`, sequence: seq, stamp,
      summary: `${assessmentName} — Speaking`, location: sp.location,
      description: 'Ca thi Speaking. Mang theo CCCD/Thẻ NV.',
      date: sp.date, startMin: sp.startMin, endMin: sp.endMin,
    }),
    ...vevent({
      uid: `${empCode}-3S@assessment-booking`, sequence: seq, stamp,
      summary: `${assessmentName} — 3 Skills`, location: sk.location,
      description: 'Ca thi 3 Skills. Mang theo CCCD/Thẻ NV.',
      date: sk.date, startMin: sk.startMin, endMin: sk.endMin,
    }),
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}

module.exports = { buildBookingIcs, toIcsUtc, escapeText };
