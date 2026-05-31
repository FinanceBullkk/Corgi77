# Implementation — Add-to-Calendar (.ics) sau khi đăng ký

**Cho:** Codex thực thi.
**Ngày:** 2026-05-31
**Phương án:** A+B đã chốt → **`.ics` 2 kênh** (email attachment + nút tải trên màn success).
KHÔNG làm OAuth Calendar API (cách C). KHÔNG dùng Google Calendar template link (sẽ tạo event trùng vì không kiểm soát được UID).

---

## 0. Quyết định kiến trúc (đọc trước khi code)

- **Một file `.ics` chứa 2 VEVENT** (Speaking + 3 Skills). User "Add" 1 lần được cả 2 ca.
- **Idempotent giữa 2 kênh:** email .ics và app .ics dùng **CÙNG `UID`** → user add từ app rồi add lại từ email → lịch **không nhân đôi** (cùng UID = cùng event).
- **`UID` theo (empCode, loại ca), ỔN ĐỊNH qua các lần đổi ca:**
  - Speaking: `${empCode}-SP@assessment-booking`
  - 3 Skills: `${empCode}-3S@assessment-booking`
  - → đổi slot vẫn cùng UID → calendar **update** event cũ thay vì tạo mới.
- **`SEQUENCE` = `changeCount`** (monotonic tăng mỗi lần đổi) → calendar hiểu đây là bản cập nhật.
- **Timezone:** slot là giờ local **Asia/Ho_Chi_Minh = UTC+7 cố định (VN không có DST)**. Emit DTSTART/DTEND dạng **UTC** (`...Z`) bằng cách trừ 420 phút. Không cần block VTIMEZONE.
- **Reminder:** mỗi VEVENT có 2 `VALARM` — trước **1 ngày** và **1 giờ**. Đây là giá trị UX lớn nhất (user không quên).
- **Cross-runtime dup chấp nhận được:** builder tồn tại 2 bản — `functions/ics-helpers.js` (CommonJS, cho email) và `src/lib/ics.ts` (TS, cho nút tải). Giống pattern `minToHHmm` đã có sẵn ở cả `src` lẫn `functions`. Mỗi bản có comment trỏ bản kia để sync.

---

## 1. Quy tắc dựng .ics (BẮT BUỘC đúng)

- Line ending **CRLF** (`\r\n`). Kết thúc file có newline cuối.
- Escape field TEXT (SUMMARY/LOCATION/DESCRIPTION) theo RFC 5545: `\` → `\\`, `;` → `\;`, `,` → `\,`, newline → `\n`.
- Format thời gian UTC: `YYYYMMDDTHHMMSSZ`.
- Công thức UTC: `Date.UTC(y, mo-1, d) + (minLocal - 420) * 60000`.
  - Verify: `2026-06-22`, startMin=540 (09:00 local) → `20260622T020000Z` (02:00Z). ✅

---

## 2. Files

### 2.1 TẠO `functions/ics-helpers.js`

```js
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
```

### 2.2 SỬA `functions/email-helpers.js`

- `require` builder ở đầu file: `const { buildBookingIcs } = require('./ics-helpers');`
- `queueConfirmationEmail(...)` đã nhận `sp, sk, assessmentName`. Thêm tham số `empCode, sequence`.
- Trong `message` thêm `attachments`:

```js
async function queueConfirmationEmail(db, email, fullName, sp, sk, isUpdate, assessmentName, empCode, sequence) {
  // ...giữ nguyên fmtSlot, verb, subject, html...
  const ics = buildBookingIcs({ empCode, sp, sk, sequence, assessmentName });
  await db.collection('mail').add({
    to: email,
    message: {
      subject: `[${assessmentName}] Xác nhận ${verb} ca thi`,
      html: `...giữ nguyên...`,
      attachments: [{
        filename: 'lich-thi-assessment.ics',
        content: ics,
        contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
      }],
    },
  });
}
```

### 2.3 SỬA `functions/booking-handlers.js`

- Chỗ tạo `mailData` (nhánh `cfg.emailConfirm === true`): thêm `empCode` và `sequence: changeCount` vào `mailData`.
- Chỗ gọi `queueConfirmationEmail(...)`: truyền thêm `mailData.empCode, mailData.sequence`.

```js
// trong transaction:
mailData = {
  fullName, sp, sk, isUpdate: !!oldReg,
  assessmentName: (typeof cfg.assessmentName === 'string' && cfg.assessmentName.trim())
    ? cfg.assessmentName.trim() : defaultAssessmentName,
  empCode,
  sequence: changeCount,
};

// sau transaction:
await queueConfirmationEmail(
  db, email, mailData.fullName, mailData.sp, mailData.sk,
  mailData.isUpdate, mailData.assessmentName, mailData.empCode, mailData.sequence,
);
```

### 2.4 TẠO `src/lib/ics.ts` (bản TS cho nút tải)

```ts
// Build .ics cho 2 ca thi — bản client (nút "Thêm vào lịch" trên success screen).
// SYNC: logic khớp functions/ics-helpers.js.
import type { Slot } from './types';

const VN_OFFSET_MIN = 7 * 60;
const pad = (n: number) => String(n).padStart(2, '0');

function fmtUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
    + `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
function toIcsUtc(date: string, minLocal: number): string {
  const [y, mo, d] = date.split('-').map(Number);
  return fmtUtc(Date.UTC(y, mo - 1, d) + (minLocal - VN_OFFSET_MIN) * 60000);
}
function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function vevent(uid: string, seq: number, stamp: string, summary: string, slot: Slot, desc: string): string[] {
  return [
    'BEGIN:VEVENT', `UID:${uid}`, `SEQUENCE:${seq}`, `DTSTAMP:${stamp}`,
    `DTSTART:${toIcsUtc(slot.date, slot.startMin)}`, `DTEND:${toIcsUtc(slot.date, slot.endMin)}`,
    `SUMMARY:${escapeText(summary)}`,
    slot.location ? `LOCATION:${escapeText(slot.location)}` : '',
    `DESCRIPTION:${escapeText(desc)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Nhắc lịch thi (1 ngày trước)', 'TRIGGER:-P1D', 'END:VALARM',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Nhắc lịch thi (1 giờ trước)', 'TRIGGER:-PT1H', 'END:VALARM',
    'END:VEVENT',
  ].filter(Boolean);
}

export function buildBookingIcs(opts: {
  empCode: string; sp: Slot; sk: Slot; sequence: number; assessmentName: string; now?: Date;
}): string {
  const { empCode, sp, sk, sequence, assessmentName, now = new Date() } = opts;
  const stamp = fmtUtc(now.getTime());
  const seq = Number.isFinite(sequence) && sequence >= 0 ? sequence : 0;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Assessment Booking//Corgi7//VI',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    ...vevent(`${empCode}-SP@assessment-booking`, seq, stamp, `${assessmentName} — Speaking`, sp, 'Ca thi Speaking. Mang theo CCCD/Thẻ NV.'),
    ...vevent(`${empCode}-3S@assessment-booking`, seq, stamp, `${assessmentName} — 3 Skills`, sk, 'Ca thi 3 Skills. Mang theo CCCD/Thẻ NV.'),
    'END:VCALENDAR',
  ].join('\r\n') + '\r\n';
}

export function downloadBookingIcs(opts: { empCode: string; sp: Slot; sk: Slot; sequence: number; assessmentName: string }) {
  const ics = buildBookingIcs(opts);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lich-thi-assessment.ics';
  a.click();
  URL.revokeObjectURL(url);
}
```

### 2.5 Thread `assessmentName` ra client (mirror pattern `buList`)

- `src/lib/types.ts` → thêm `assessmentName: string;` vào `InitResult`.
- `src/lib/db.ts`:
  - thêm const `DEFAULT_ASSESSMENT_NAME = 'Assessment Q2 2026'; // Sync with functions/index.js`
  - `ConfigData` thêm `assessmentName: string;`
  - `getConfig()` trả `assessmentName: typeof d.assessmentName === 'string' && d.assessmentName.trim() ? d.assessmentName.trim() : DEFAULT_ASSESSMENT_NAME`
  - `initDb()` trả `assessmentName: cfg.assessmentName`

### 2.6 SỬA `src/booking/success-screen.tsx`

- Thêm prop `assessmentName: string` (và đã có `changeCount`).
- Thêm nút trong `card-ft` (hoặc 1 hàng riêng dưới countdown), chỉ hiện khi có đủ `sp && sk`:

```tsx
{sp && sk && (
  <button
    className="btn sm"
    onClick={() => downloadBookingIcs({
      empCode: step1.empCode, sp, sk, sequence: changeCount, assessmentName,
    })}
  >
    📅 Thêm 2 ca thi vào lịch
  </button>
)}
```
- `import { downloadBookingIcs } from '../lib/ics';`

### 2.7 SỬA `src/booking/booking-result-views.tsx`

- `BookingSuccessView` truyền `assessmentName={data.assessmentName}` xuống `<SuccessScreen>`.

### 2.8 (Khuyến nghị, cùng PR) Nút tải trên `src/booking/booking-display.tsx`

- User quay lại xem booking hiện tại cũng cần add được. Thêm nút `downloadBookingIcs` tương tự (lấy `sp/sk` từ `booking.speakingSlotId/skillsSlotId` resolve trong `slots`, `sequence = booking.changeCount`, `assessmentName` từ prop mới). Nếu scope căng, để Phase 2.

---

## 3. Tests (BẮT BUỘC)

### 3.1 `functions-booking.test.ts` — bổ sung
- Test `buildBookingIcs` (require trực tiếp `functions/ics-helpers.js`):
  - Output chứa `BEGIN:VCALENDAR`, đúng **2** `BEGIN:VEVENT`, 4 `VALARM`.
  - UID đúng: `262010-SP@...` và `262010-3S@...`.
  - **Timezone:** slot `{date:'2026-06-22', startMin:540}` → chứa `DTSTART:20260622T020000Z`.
  - `SEQUENCE:` = changeCount truyền vào.
  - Escape: location `'Room A, B; C'` → `Room A\,B\; C` trong LOCATION.
  - CRLF: output chứa `\r\n`.
- Test booking khi `emailConfirm:true` → mail doc có `message.attachments[0].filename === 'lich-thi-assessment.ics'` và `content` chứa `BEGIN:VCALENDAR`.
  - **Lưu ý harness:** `FakeDb.collection('mail').add` đã ghi vào `collectionAdds`; assert qua đó.

### 3.2 `src/__tests__/ics.test.ts` — TẠO mới
- Test `buildBookingIcs` (TS) cho **kết quả byte-giống** bản JS với cùng input + cùng `now` (truyền `now` cố định để DTSTAMP ổn định). Tối thiểu: cùng UID, cùng DTSTART/DTEND, cùng SEQUENCE, cùng số VEVENT/VALARM.
- Test `escapeText`, `toIcsUtc` biên: nửa đêm (startMin 0), cuối ngày.

---

## 4. Acceptance criteria

- [ ] `npm run typecheck` ✅
- [ ] `npm test -- --run` ✅ (tất cả cũ + mới)
- [ ] `npm run check:functions` ✅
- [ ] `npm run build` ✅
- [ ] Email xác nhận (khi `emailConfirm` bật) có đính kèm `lich-thi-assessment.ics` hợp lệ, 2 VEVENT, 2 VALARM/event, giờ UTC đúng (+7 quy đổi).
- [ ] Nút "Thêm 2 ca thi vào lịch" trên success screen tải file .ics mở được bằng Google/Apple Calendar, thêm đúng 2 event đúng giờ Việt Nam.
- [ ] Đổi ca rồi add lại (email hoặc app) → event **cập nhật**, KHÔNG nhân đôi (cùng UID, SEQUENCE tăng).

---

## 5. Out of scope (Phase 2, KHÔNG làm lần này)

- Google Calendar API auto-insert (cách C / OAuth offline).
- `.ics METHOD:CANCEL` khi user hủy (tự xóa event khỏi lịch).
- Email reminder theo lịch 7/3/1 ngày (cần scheduled function riêng — lưu ý: copy ở `success-screen.tsx:90` đang HỨA reminder này nhưng hệ thống CHƯA có; cân nhắc chỉnh wording hoặc làm Phase 2).
- Line folding >75 octet (lines hiện ngắn, chưa cần).

---

## 6. Rủi ro / câu hỏi cần xác minh

1. **firestore-send-email version:** xác nhận extension đang deploy forward `message.attachments` tới nodemailer (các bản hiện hành đều có). Nếu bản cũ không hỗ trợ → attachment bị bỏ qua (email vẫn gửi, chỉ thiếu file). Test bằng 1 email thật trên staging.
2. **Inline content vs base64:** nếu provider SMTP từ chối inline string, đổi sang `content: Buffer.from(ics).toString('base64')` + `encoding: 'base64'`.
3. **Apple Calendar caching UID:** đổi ca lần đầu một số client cần `SEQUENCE` tăng mới chịu update — đã dùng `changeCount`, đảm bảo nó luôn tăng (đã có `Math.max(0, ...)` ở handler).
