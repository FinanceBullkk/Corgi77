# AUDIT MASTER — Corgi7 Assessment Booking Q2 2026

**Ngày audit:** 2026-05-31  
**Kiểm chứng:** `tsc --noEmit` ✅ · `npm test` 133/133 ✅  
**File đã đọc:** `firestore.rules`, `functions/index.js`, `src/lib/{db,adminDb,admin,audit,monitoring,types,firebase}.ts`, `src/App.tsx`, `src/booking/*`, `.github/workflows/deploy.yml`

---

## 1. BẢNG ĐIỂM TỔNG QUAN

| # | Hạng mục | Điểm | Nhận xét |
|---|---|---|---|
| 1 | Bảo mật | **B+** | Rules đúng trên đường tiền; không hardcode admin; thiếu rate limiting ở Functions |
| 2 | Giao dịch & Concurrency | **A-** | Read-before-write nhất quán; empCodeClaims optimistic lock; tốt |
| 3 | Nghiệp vụ / Luồng | **B+** | Logic cancel/re-register đúng; quota đúng; BU list hardcode, email template cứng |
| 4 | Kiến trúc & Code | **C+** | DRY vi phạm nghiêm (`minToHHmm` × 4, `slotFromDoc` × 2); 3 file vượt 200 LOC |
| 5 | Kiểm thử | **B** | 133 tests pass; CI có emulator test; mock theo vị trí hàng đợi (giòn) |
| 6 | Hiệu năng & Bundle | **B+** | AdminPanel code-split; Functions SDK lazy-load; listRegistrations có cap 5000 |
| 7 | UX/UI & a11y | **B** | aria-labels có; stepper có; BU list không config được; fullName không có maxLength server |
| 8 | Nội dung & i18n | **B-** | Thông báo email trung thực; template email hardcode tên quý; không có i18n framework |
| 9 | Data model & Integrity | **B+** | Schema nhất quán; trường `email` thừa trong registration doc |
| 10 | Error handling & Observability | **B** | Sentry có; auditLog fail không lên Sentry; `console.warn` song song Sentry |
| 11 | Tài liệu | **D** | Không có `./docs/`; README đã cập nhật Firebase nhưng thiếu hoàn toàn docs kỹ thuật |

---

## 2. KẾT LUẬN THẲNG

**Rủi ro lớn nhất là mảng 4 (Kiến trúc) & 11 (Tài liệu).** Đường tiền (capacity/quota/overlap) được bảo vệ tốt — transaction đúng thứ tự read-before-write, empCodeClaims lock chắc, Firestore rules dùng `request.time`. **Không có lỗ hổng bảo mật nghiêm trọng.** Tuy nhiên, `minToHHmm` sống ở 4 chỗ khác nhau với logic giống hệt, 3 file vượt 200 LOC, và hoàn toàn không có `./docs/`. Nếu cần onboard người mới hoặc handoff sang quý sau, đây là điểm yếu thực sự.

---

## 3. PHÁT HIỆN

### 🟠 HIGH

**[S1] `updateSlot()` không validate `remaining` bounds phía client**
- **Vị trí:** `src/lib/adminDb.ts:331–337`
- **Gốc:** `updateDoc(doc(db, 'slots', slotId), updates)` gọi thẳng không kiểm tra `0 ≤ remaining ≤ capacity`. Firestore rules là lưới duy nhất — nếu rule bị sửa sai, client ghi dữ liệu xấu.
- **Sửa:** Thêm guard trong `updateSlot()`:
  ```ts
  if (updates.remaining !== undefined && updates.remaining < 0)
    throw new Error('remaining không được âm');
  ```
- **Trạng thái:** Đã kiểm chứng (đọc code).

**[S2] Cloud Functions không có per-user rate limiting**
- **Vị trí:** `functions/index.js:133–302` (`bookRegistration`, `cancelRegistration`)
- **Gốc:** Không có quota/throttle per-user. `maxChanges` giới hạn số lần thành công, không giới hạn tần suất gọi. User có thể spam calls.
- **Sửa:** Dùng `firebase-functions-rate-limiter` hoặc lưu `lastCallAt` + throw nếu < N giây. Tối thiểu: bật Firebase App Check.
- **Trạng thái:** Suy đoán cần xác minh (không thấy throttle nào trong code).

---

### 🟡 MEDIUM

**[C1] `minToHHmm` nhân bản ở 4 nơi — DRY vi phạm**
- **Vị trí:** `src/lib/db.ts:14–17` · `src/lib/adminDb.ts:69–73` · `functions/index.js:10–13` · `src/lib/types.ts:75–79`
- **Gốc:** `types.ts` đã export hàm này nhưng `db.ts` và `adminDb.ts` khai báo lại riêng thay vì import.
- **Sửa:** Xóa hàm trong `db.ts:14–17` và `adminDb.ts:69–73`, import từ `'./types'`. (functions/index.js là JS riêng biệt — giữ nguyên hoặc copy từ types khi build.)
- **Trạng thái:** Đã kiểm chứng.

**[C2] `slotFromDoc` nhân bản ở 2 nơi**
- **Vị trí:** `src/lib/db.ts:20–33` · `src/lib/adminDb.ts:75–88`
- **Gốc:** Hai hàm giống hệt nhau, không share. `functions/index.js:30–44` có bản thứ 3 dùng `||` thay `??`.
- **Sửa:** Trích ra `src/lib/slot-helpers.ts`, export `slotFromDoc`, import vào cả `db.ts` và `adminDb.ts`.
- **Trạng thái:** Đã kiểm chứng.

**[C3] 3 file vượt 200-LOC guideline**
- **Vị trí:**
  - `src/App.tsx`: 445 dòng
  - `src/lib/adminDb.ts`: 424 dòng
  - `functions/index.js`: 316 dòng
- **Sửa:**
  - `App.tsx`: tách phần step2+confirm rendering ra `BookingFlow.tsx`
  - `adminDb.ts`: tách `downloadRegistrationsCsv` + CSV logic ra `csv-export.ts`
  - `functions/index.js`: tách `queueConfirmationEmail` + `repairClaims` ra `email-helpers.js` và `repair-claims.js`
- **Trạng thái:** Đã kiểm chứng (`wc -l`).

**[C4] `maxChanges` default=3 hardcode ở 2 nơi**
- **Vị trí:** `src/lib/db.ts:56` · `functions/index.js:205`
- **Gốc:** Không có constant dùng chung giữa client và server.
- **Sửa:** Cross-runtime nên không share được — ít nhất đặt comment `// DEFAULT_MAX_CHANGES = 3, sync with functions/index.js:205` ở cả hai chỗ. Lý tưởng: đọc từ `config/main` cả hai phía.
- **Trạng thái:** Đã kiểm chứng.

**[W1] `BU_LIST` hardcode trong `booking-utils.ts` — không cấu hình được**
- **Vị trí:** `src/booking/booking-utils.ts:21`
  ```ts
  export const BU_LIST = ['BSG', 'CHORUS', 'LBU', 'MOC', 'ONC', 'POC', 'TBU']
  ```
- **Gốc:** Không đọc từ `config/main`.
- **Tác động:** Thêm/bỏ BU phải deploy lại code.
- **Sửa:** Thêm `buList: string[]` vào `config/main`, đọc trong `getConfig()`, truyền vào `InitResult`.
- **Trạng thái:** Đã kiểm chứng.

**[W2] Email template hardcode tên quý**
- **Vị trí:** `functions/index.js:87` (`subject`) · `functions/index.js:89` (`<p>...Q2 2026...</p>`)
- **Gốc:** Chuỗi `'Assessment Q2 2026'` cứng trong code.
- **Sửa:** Thêm `assessmentName: string` vào `config/main`, dùng trong `queueConfirmationEmail(...)`.
- **Trạng thái:** Đã kiểm chứng.

**[T1] Mock tests theo vị trí hàng đợi — dễ gãy**
- **Vị trí:** `src/__tests__/db.test.ts` (và các test file khác dùng `mockGetDoc.mockResolvedValueOnce`)
- **Gốc:** Nếu `checkIneligibility()` hoặc `initDb()` thêm 1 `getDoc` call, tất cả tests sau đó lệch mock mà không báo lỗi rõ ràng.
- **Sửa:** Dùng path-based mock:
  ```ts
  mockGetDoc.mockImplementation((ref) => {
    if (ref.path === 'config/main') return mockDocSnap(true, TEST_CONFIG);
    if (ref.path === 'ineligibility/262010') return mockDocSnap(false);
    // ...
  });
  ```
- **Trạng thái:** Đã kiểm chứng.

**[E1] `auditLog()` failures không lên Sentry**
- **Vị trí:** `src/lib/audit.ts:35`
  ```ts
  console.warn('Audit log failed (non-blocking):', e)
  ```
- **Gốc:** Chỉ `console.warn`, không gọi `captureError`.
- **Sửa:** Thêm `captureError(e, { operation: 'auditLog' })` trước `console.warn`.
- **Trạng thái:** Đã kiểm chứng.

**[E2] `captureError()` luôn gọi `console.warn` dù Sentry đã active**
- **Vị trí:** `src/lib/monitoring.ts:30–33`
- **Gốc:** `console.warn` được gọi song song với `Sentry.captureException` → duplicate noise.
- **Sửa:** `else console.warn(...)` — chỉ log nếu Sentry không configured.
- **Trạng thái:** Đã kiểm chứng.

**[Doc1] Không có `./docs/` directory**
- **Vị trí:** Root project — directory `docs/` không tồn tại.
- **Gốc:** CLAUDE.md yêu cầu duy trì `docs/system-architecture.md`, `docs/code-standards.md`, v.v. nhưng chưa được tạo.
- **Sửa:** Tạo tối thiểu `docs/system-architecture.md` và `docs/codebase-summary.md`.
- **Trạng thái:** Đã kiểm chứng (`ls` không thấy `docs/`).

---

### 🟢 LOW / INFO

**[C5] Dead code trong `firestore.rules`**
- **Vị trí:** `firestore.rules:55–70` — `validOwnEmpCodeClaim` và `validClaimForExistingRegistration` được định nghĩa nhưng không được dùng trong bất kỳ `allow` rule nào.
- **Sửa:** Xóa 2 function này hoặc comment lại lý do giữ.
- **Trạng thái:** Đã kiểm chứng.

**[C6] `serverNow` trong `InitResult` là client time, không phải server time**
- **Vị trí:** `src/lib/db.ts:162` — `serverNow: new Date().toISOString()` (là client clock).
- **Gốc:** `App.tsx:75` dùng `skewRef.current = new Date(d.serverNow).getTime() - Date.now()` → luôn ≈ 0ms. Dead logic.
- **Sửa:** Đổi tên thành `clientNow` hoặc lấy timestamp thật từ server (e.g. Firestore `serverTimestamp`).
- **Trạng thái:** Đã kiểm chứng.

**[D1] Trường `email` thừa trong registration document**
- **Vị trí:** `src/lib/adminDb.ts:186` — `{ email: d.id, empCode: ... }` — doc ID đã là email.
- **Gốc:** Redundant field, không nhất quán với convention "doc ID là key".
- **Trạng thái:** Đã kiểm chứng. (Không urgent — xóa cần migration dữ liệu cũ.)

**[T2] `SEC-08` test xác minh audit trail nhưng không xác minh Firestore rule block**
- **Vị trí:** `src/__tests__/security.test.ts:222–239`
- **Gốc:** Mock không enforce Firestore rules. Test chứng minh audit trail được ghi, không phải rule chặn write. Comment chưa nói rõ hạn chế này.
- **Sửa:** Thêm comment `// NOTE: rule enforcement is only verified in firestore-rules.emulator.test.ts`.
- **Trạng thái:** Đã kiểm chứng.

**[P1] `listRegistrations()` load toàn bộ vào RAM — không stream**
- **Vị trí:** `src/lib/adminDb.ts:223–231` — hard cap 5000, không stream.
- **Gốc:** Không phải vấn đề hiện tại (quy mô nhỏ) nhưng cần ghi chú nếu scale.
- **Trạng thái:** Đã kiểm chứng.

---

## 4. HÀNH ĐỘNG ƯU TIÊN (theo tác động)

| # | ID | Hành động | Tác động |
|---|---|---|---|
| 1 | **Doc1** | Tạo `docs/system-architecture.md` + `docs/codebase-summary.md` | Onboard / handoff quý sau |
| 2 | **C1** | Xóa `minToHHmm` trong `db.ts:14` và `adminDb.ts:69`; import từ `types.ts` | DRY, giảm bug drift |
| 3 | **C2** | Trích `slotFromDoc` ra `src/lib/slot-helpers.ts`, dùng chung `db.ts` + `adminDb.ts` | DRY |
| 4 | **C3** | Tách `App.tsx` → `BookingFlow.tsx`; `adminDb.ts` → `csv-export.ts` | Maintainability |
| 5 | **W1** | Đưa `BU_LIST` vào `config/main` | Không cần deploy khi đổi BU |
| 6 | **W2** | Đưa `assessmentName` vào `config/main`, dùng trong email template | Reusable sang Q3+ |
| 7 | **E1** | Thêm `captureError` vào `auditLog()` catch block | Observability |
| 8 | **E2** | Sửa `captureError`: chỉ `console.warn` khi Sentry không configured | Giảm noise |
| 9 | **S1** | Thêm `remaining >= 0` guard trong `updateSlot()` | Defense in depth |
| 10 | **S2** | Cân nhắc App Check hoặc per-user rate limiting cho Functions | DoS prevention |
| 11 | **T1** | Refactor mocks từ positional → path-based trong test files | Test stability |
| 12 | **C5** | Xóa dead functions trong `firestore.rules:55–70` | Clarity |
| 13 | **C6** | Đổi tên `serverNow` → `clientNow` hoặc lấy server timestamp thật | Correctness |

---

## Câu hỏi còn mở

1. `scheduledRepairEmpCodeClaims` chạy mỗi 5 phút — cần thiết không nếu transaction đã đảm bảo consistency? Chi phí Firestore read đáng xem lại.
2. `emailSent=true` nghĩa "đã xếp hàng gửi", không phải "đã tới hộp thư" — `success-screen.tsx` có nói rõ điều này không?
