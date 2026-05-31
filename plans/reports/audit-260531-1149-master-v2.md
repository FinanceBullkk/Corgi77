# AUDIT MASTER v2 — Corgi7 (post-fix, 2026-05-31)

**Ngày audit:** 2026-05-31  
**Kiểm chứng:** `tsc --noEmit` ✅ · `npm test` 135/135 ✅  
**File đã đọc:** `firestore.rules`, `functions/*.js`, `src/lib/*.ts`, `src/booking/*`, `src/__tests__/*`

> Audit lần này là lần **thứ 2** sau khi Codex đã fix 13/13 findings từ audit v1. Không còn finding nào từ v1 tồn tại.

---

## 1. BẢNG ĐIỂM TỔNG QUAN

| # | Hạng mục | Điểm | Nhận xét |
|---|---|---|---|
| 1 | Bảo mật | **A-** | App Check + rate limit thêm vào; `functionRateLimits` không có rule tường minh |
| 2 | Giao dịch & Concurrency | **A** | Rate limit đọc TRONG transaction; read-before-write kỷ luật; empCodeClaims lock đúng |
| 3 | Nghiệp vụ / Luồng | **A-** | BU validate server-side (mới); `buList.length=0` bỏ qua validate — edge case cần xác nhận |
| 4 | Kiến trúc & Code | **B+** | Mọi file ≤ 203 LOC; DRY sạch; 1 `any` còn lại |
| 5 | Kiểm thử | **B** | 135/135 pass; `security.test.ts` vẫn 73 positional mocks |
| 6 | Hiệu năng & Bundle | **B** | Code-split OK; `cleanupRegistrationEmailFields` O(N) write tuần tự không batch |
| 7 | UX/UI & a11y | **B** | Không thay đổi so với audit v1 |
| 8 | Nội dung & i18n | **B+** | `assessmentName` đọc từ config; email template trung thực |
| 9 | Data model & Integrity | **A-** | D1 fixed: `email` field không còn ghi vào registration doc; cleanup callable có |
| 10 | Error handling & Observability | **B+** | Sentry/console.warn đúng; Functions `addAudit` dùng `console.warn` server-side (chấp nhận) |
| 11 | Tài liệu | **C+** | `docs/` tạo rồi nhưng còn thiếu `code-standards.md`, `deployment-guide.md` per CLAUDE.md |

---

## 2. KẾT LUẬN THẲNG

Codebase cải thiện đáng kể — không còn finding HIGH nào từ v1. **Rủi ro còn lại tập trung ở:** (1) `functionRateLimits` không có Firestore rule tường minh dễ bị drift; (2) `cleanupRegistrationEmailFields` không batch gây tốn Firestore cost khi data lớn; (3) `security.test.ts` vẫn positional mocks — giòn khi refactor. Đường tiền (capacity/quota/overlap + rate limit) hiện chắc chắn ở mức A.

---

## 3. PHÁT HIỆN

### 🟠 HIGH

**[S3] `functionRateLimits` collection không có Firestore rule tường minh**
- **Vị trí:** `firestore.rules` — không có `match /functionRateLimits/{id}` block nào.
- **Nguyên nhân gốc:** Cloud Functions dùng Admin SDK (bypass rules) nên VIẾT được. Firestore mặc định DENY nếu không match rule — an toàn hiện tại. Nhưng nếu ai sau này thêm catch-all rule kiểu `match /{document=**} { allow read: if request.auth != null; }`, collection này bị lộ toàn bộ rate-limit state của mọi user.
- **Cách sửa:** Thêm explicit block vào `firestore.rules` (đặt trước closing `}` cuối cùng):
  ```
  // ─── Function Rate Limits (Cloud Functions only via Admin SDK) ───────────
  match /functionRateLimits/{id} {
    allow read, write: if false; // Admin SDK only — client SDK never touches this
  }
  ```
- **Trạng thái:** Đã kiểm chứng (`grep -n functionRateLimit firestore.rules` → không kết quả).

---

### 🟡 MEDIUM

**[P2] `cleanupRegistrationEmailFields` viết O(N) tuần tự — không dùng WriteBatch**
- **Vị trí:** `functions/maintenance.js:6–13`
  ```js
  for (const doc of snap.docs) {
    scanned += 1;
    const data = doc.data();
    if (!Object.prototype.hasOwnProperty.call(data, 'email')) continue;
    await db.doc(`registrations/${doc.id}`).update({ email: FieldValue.delete() });
    cleaned += 1;
  }
  ```
- **Nguyên nhân gốc:** Mỗi `await update()` là 1 Firestore write riêng biệt. 5000 registrations = 5000 sequential round-trips. Firestore `WriteBatch` cho phép gom 500 writes/lần.
- **Cách sửa:** Refactor dùng `WriteBatch`, flush mỗi 500 docs:
  ```js
  async function cleanupRegistrationEmailFields(db, FieldValue) {
    const snap = await db.collection('registrations').get();
    let scanned = 0;
    let cleaned = 0;
    let batch = db.batch();
    let batchCount = 0;

    for (const doc of snap.docs) {
      scanned += 1;
      if (!Object.prototype.hasOwnProperty.call(doc.data(), 'email')) continue;
      batch.update(doc.ref, { email: FieldValue.delete() });
      cleaned += 1;
      batchCount += 1;
      if (batchCount % 500 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
    if (batchCount % 500 !== 0 && cleaned > 0) await batch.commit();
    return { scanned, cleaned };
  }
  ```
- **Trạng thái:** Đã kiểm chứng.

**[T2] `security.test.ts` vẫn dùng 73 positional `mockResolvedValueOnce`**
- **Vị trí:** `src/__tests__/security.test.ts` — 73 lần `mockResolvedValueOnce` theo thứ tự call, không theo path.
- **Nguyên nhân gốc:** Chỉ `db.test.ts` được refactor sang path-based mock (`mockGetDoc.mockImplementation((ref) => { ... ref.path })`); `security.test.ts` chưa được cập nhật.
- **Tác động:** Nếu `checkIneligibility()` hoặc `initDb()` thêm/đổi 1 `getDoc` call, các test sau lệch mock mà không báo lỗi rõ ràng.
- **Cách sửa:** Áp dụng pattern path-based mock giống `src/__tests__/db.test.ts:84–93`:
  ```ts
  mockGetDoc.mockImplementation((ref: { path: string }) => {
    if (ref.path === 'ineligibility/262010') return mockDocSnap(false);
    if (ref.path === 'config/main') return mockDocSnap(true, TEST_CONFIG);
    if (ref.path === 'empCodeClaims/262010') return mockDocSnap(false);
    return mockDocSnap(false);
  });
  ```
- **Trạng thái:** Đã kiểm chứng (73 positional calls tính bằng `grep -c mockResolvedValueOnce`).

**[D2] `cancelRegistration` không có rate limiting**
- **Vị trí:** `functions/cancel-handler.js` — không có `assertNotRateLimited` call, không đọc `functionRateLimits`.
- **Nguyên nhân gốc:** Chỉ `bookRegistration` được rate-limit; cancel bỏ qua.
- **Tác động:** Spam cancel có thể flood audit logs (không oversell, nhưng gây noise observability).
- **Cách sửa:** Thêm rate limit tương tự `bookRegistration` — đọc `rateLimitRef('cancelRegistration', email)` trong transaction, gọi `assertNotRateLimited(rateSnap)`, cập nhật `userRateRef` sau khi transaction thành công.
- **Trạng thái:** Đã kiểm chứng (đọc cancel-handler.js — không thấy rate limit logic).

**[W3] `buList.length=0` → bỏ qua validate BU server-side**
- **Vị trí:** `functions/booking-handlers.js:84–85`
  ```js
  const buList = Array.isArray(cfg.buList) ? cfg.buList.map(String) : [];
  if (buList.length > 0 && !buList.includes(bu)) throw businessError('BU không hợp lệ.');
  ```
- **Nguyên nhân gốc:** Nếu `config/main` chưa có trường `buList` (env mới, staging chưa seed), validate BU bị bỏ qua hoàn toàn — bất kỳ chuỗi BU nào được chấp nhận.
- **Cách sửa (option A — safe fallback):** Fallback về `DEFAULT_BU_LIST` khi `buList` rỗng:
  ```js
  const buList = (Array.isArray(cfg.buList) && cfg.buList.length > 0)
    ? cfg.buList.map(String)
    : defaultBuList; // thêm `defaultBuList` vào deps của handler
  ```
- **Cách sửa (option B — keep intentional):** Thêm comment rõ ý định: `// empty buList = no BU restriction (backward-compat for envs without buList set)`.
- **Trạng thái:** Đã kiểm chứng. **Cần xác nhận intent với dev** trước khi chọn option.

**[Doc2] `docs/` còn thiếu file theo CLAUDE.md**
- **Vị trí:** `docs/` hiện có `codebase-summary.md` + `system-architecture.md`.
- **Thiếu:** `code-standards.md`, `deployment-guide.md`, `design-guidelines.md`, `project-roadmap.md` (per `~/.claude/CLAUDE.md` → Documentation Management section).
- **Cách sửa:** Tạo tối thiểu `docs/code-standards.md` + `docs/deployment-guide.md`.
- **Trạng thái:** Đã kiểm chứng (`ls docs/`).

---

### 🟢 LOW / INFO

**[C7] 1 `any` còn lại trong `admin-registrations.ts`**
- **Vị trí:** `src/lib/admin-registrations.ts:104` — `const add = (d: any) =>`
- **Cách sửa:** Đổi thành `QueryDocumentSnapshot<DocumentData>` (đã import ở đầu file).
- **Trạng thái:** Đã kiểm chứng.

**[S4] `USER_RATE_LIMIT_MS=3000` hardcode — không cấu hình runtime**
- **Vị trí:** `functions/index.js:16`
- **Gốc:** Đổi window throttle phải redeploy Functions. Nhất quán với pattern đưa giá trị vào `config/main`.
- **Trạng thái:** Đã kiểm chứng. LOW priority.

---

## 4. HÀNH ĐỘNG ƯU TIÊN (theo tác động)

| # | ID | Hành động | File | Tác động |
|---|---|---|---|---|
| 1 | **S3** | Thêm `match /functionRateLimits/{id} { allow read, write: if false; }` | `firestore.rules` | Explicit deny, chống drift |
| 2 | **P2** | Batch `cleanupRegistrationEmailFields` theo 500 docs/lần | `functions/maintenance.js` | Firestore cost + tốc độ |
| 3 | **D2** | Thêm rate limit cho `cancelRegistration` tương tự `bookRegistration` | `functions/cancel-handler.js` | DoS / audit flood |
| 4 | **T2** | Refactor `security.test.ts` sang path-based mocks | `src/__tests__/security.test.ts` | Test stability |
| 5 | **W3** | Xác nhận intent `buList.length=0` rồi chọn option A hoặc B | `functions/booking-handlers.js:84` | Correctness |
| 6 | **Doc2** | Tạo `docs/code-standards.md` + `docs/deployment-guide.md` | `docs/` | CLAUDE.md compliance |
| 7 | **C7** | Đổi `any` → `QueryDocumentSnapshot<DocumentData>` | `src/lib/admin-registrations.ts:104` | Type safety |
| 8 | **S4** | Cân nhắc đưa `USER_RATE_LIMIT_MS` vào `config/main` | `functions/index.js` | Runtime configurable |

---

## Câu hỏi cần xác nhận trước khi fix

1. **W3** — `buList.length=0 → skip validate BU` có phải behavior mong muốn không? Hay nên fallback về `DEFAULT_BU_LIST` giống client-side?
2. **D2** — Cancel spam có đủ nguy hiểm để rate limit? (tác động nhỏ hơn book vì không ảnh hưởng capacity)
