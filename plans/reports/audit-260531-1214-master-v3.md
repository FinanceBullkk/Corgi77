# AUDIT MASTER v3 — Corgi7 (Opus pass, 2026-05-31)

**Ngày audit:** 2026-05-31
**Kiểm chứng:** `tsc --noEmit` ✅ · `vitest` 137/137 ✅ · `npm run build` ✅ (firebase chunk 497KB / 116KB gzip)
**File đọc fresh:** `firestore.rules`, `functions/{index,booking-handlers,cancel-handler,email-helpers,repair-claims,maintenance}.js`, `src/lib/{db,adminDb,admin-registrations,csv-export}.ts`, `src/booking/booking-flow.tsx`, `.github/workflows/deploy.yml`

> Audit lần **thứ 3**. Tất cả 8 finding của v2 đã verify đã đóng. Pass này chỉ tìm thấy **1 MEDIUM mới** (S5) + vài cleanup nhỏ. Không có 🔴/🟠.

---

## 1. BẢNG ĐIỂM TỔNG QUAN

| # | Hạng mục | Điểm | Nhận xét |
|---|---|---|---|
| 1 | Bảo mật | **A−** | App Check sẵn sàng, rate-limit, explicit-deny — nhưng còn 4 helper chết trong rules (foot-gun) |
| 2 | Giao dịch & Concurrency | **A** | Read-before-write kỷ luật; rate-limit đọc/ghi trong cùng transaction; empCodeClaims lock chắc |
| 3 | Nghiệp vụ / Luồng | **A−** | buList validate cả client+server; quota/no-op đúng; eligibility phân biệt network-vs-blocked |
| 4 | Kiến trúc & Code | **A−** | Mọi file hợp lý; `calendar-step.tsx` 305 LOC; `minToHHmm` lặp trong functions/; 1 `any` |
| 5 | Kiểm thử | **A−** | 137 test; CI gate typecheck+test+rules-emulator; còn ~18 positional mock |
| 6 | Hiệu năng & Bundle | **B+** | Admin code-split; cleanup đã batch; firebase 497KB là cố hữu của SDK |
| 7 | UX/UI & a11y | **B+** | Không native confirm/alert; gates tách riêng; aria-label có |
| 8 | Nội dung & i18n | **A−** | `assessmentName` từ config; nhãn email trung thực; escHtml |
| 9 | Data model & Integrity | **A−** | Cleanup `email` field callable; schema khớp; slot-helpers dùng chung |
| 10 | Error & Observability | **A−** | Sentry wired; `auditLog`→`captureError`; friendly errors |
| 11 | Tài liệu | **B+** | `docs/` đủ 4 file; README không drift GAS; thiếu `design-guidelines`/`roadmap` |

---

## 2. KẾT LUẬN THẲNG

Hệ thống tốt sau 3 vòng. **Rủi ro lớn nhất KHÔNG phải lỗ hổng đang hoạt động** — money-path (capacity/quota/overlap + rate-limit) được Cloud Functions enforce chắc. Rủi ro duy nhất đáng kể: **4 helper chết trong `firestore.rules`** trông như đang bảo vệ registrations nhưng không nối vào bất kỳ `allow` nào — registrations chỉ check `isAdmin()`. Foot-gun: dev tương lai thấy chúng "có sẵn", nối vào `allow create` → mở client write trực tiếp, **bỏ qua** capacity/overlap/quota (chỉ functions check) → oversell.

---

## 3. PHÁT HIỆN

### 🟡 MEDIUM

**[S5] 4 helper chết trong `firestore.rules` — cảm giác an toàn giả + foot-gun**
- **Vị trí:** `firestore.rules:18` (`isEnrollmentOpen`), `:22` (`isEnrollmentOpenInner`), `:35` (`isNotBlocked`), `:43` (`hasOwnEmpCodeClaim`).
- **Bằng chứng:** `grep` từng tên → chỉ xuất hiện tại chỗ định nghĩa, không nơi nào gọi. Block `registrations` (`firestore.rules:127–132`) chỉ dùng `isAdmin()`:
  ```
  match /registrations/{email} {
    allow read: if isAdmin() || (request.auth != null && request.auth.token.email == email);
    allow create, update, delete: if isAdmin();
  }
  ```
- **Nguyên nhân gốc:** Tàn dư thiết kế cũ (client ghi registration trực tiếp). Đã chuyển hết sang Cloud Functions (Admin SDK bypass rules) → enforcement thật 100% ở functions. Các helper này không bao giờ chạy.
- **Vì sao nguy hiểm:** Dev tương lai thấy `isNotBlocked()` + `hasOwnEmpCodeClaim()` "có sẵn, đúng logic" → nối vào `allow create: if isNotBlocked() && hasOwnEmpCodeClaim()` để "cho client ghi thẳng cho nhanh". Nhưng 2 helper đó KHÔNG check capacity/overlap/quota (chỉ Cloud Functions check) → mở đường oversell + book trùng giờ + vượt quota.
- **Cách sửa:** Xoá cả 4 helper (`firestore.rules:18–47`, giữ lại `isAdmin` ở `:9`). Tương tự C5 (v1) đã xoá `validOwnEmpCodeClaim`/`validClaimForExistingRegistration` nhưng bỏ sót 4 cái này. Nếu muốn giữ làm "doc", PHẢI thêm comment cảnh báo:
  ```
  // ⚠️ NOT WIRED — enforcement is in Cloud Functions (Admin SDK).
  // Do NOT attach to any allow rule: these do not check capacity/overlap/quota.
  ```
- **Trạng thái:** Đã kiểm chứng (grep + đọc block registrations).

---

### 🟢 LOW / INFO

**[C8] `minToHHmm` lặp 2 bản trong `functions/`**
- **Vị trí:** `functions/booking-handlers.js:3` + `functions/email-helpers.js:1` — y hệt nhau.
- **Nguyên nhân gốc:** Refactor DRY trước chỉ gom phía `src/` (qua `slot-helpers.ts`/`types.ts`), bỏ sót phía functions.
- **Cách sửa:** Tạo `functions/format-helpers.js`:
  ```js
  function minToHHmm(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  module.exports = { minToHHmm };
  ```
  Rồi `const { minToHHmm } = require('./format-helpers');` ở cả `booking-handlers.js` và `email-helpers.js`, xoá 2 bản local.
- **Trạng thái:** Đã kiểm chứng.

**[C9] `calendar-step.tsx` 305 dòng — vượt guideline 200 LOC**
- **Vị trí:** `src/booking/calendar-step.tsx` (file lớn nhất repo).
- **Cách sửa:** Tách theo ranh giới: day-column render / slot-grid / week-header thành component con trong `src/booking/`.
- **Trạng thái:** Đã kiểm chứng (`wc -l`).

**[C10] 1 `any` còn sót**
- **Vị trí:** `src/admin/audit-tab.tsx:22` — `const sl = (id: any) => slotLabel(...)`.
- **Cách sửa:** `(id: unknown)` — ngay sau đã có `typeof id === 'string' ? id : null` nên narrow sẵn, đổi type không vỡ logic.
- **Trạng thái:** Đã kiểm chứng.

**[D3] Rate-limit trên `cancelRegistration` gần như vô dụng (không hại)**
- **Vị trí:** `functions/cancel-handler.js:30–33,44`.
- **Nguyên nhân:** Rate-doc chỉ ghi khi cancel **thành công** (dòng 44, trong nhánh tx tiếp tục xoá registration). Sau đó registration đã xoá → lần cancel kế fail ở `"Bạn chưa có đăng ký nào để hủy."` (dòng 34) **trước** khi rate-check có ý nghĩa. Vòng book→cancel→book vốn đã bị book rate-limit (3s) chặn.
- **Cách sửa:** Tuỳ chọn — giữ nguyên (vô hại) hoặc bỏ block rate-limit khỏi cancel cho gọn. Không bắt buộc.
- **Trạng thái:** Đã kiểm chứng (suy luận thứ tự đọc/ghi trong transaction — KHÔNG phải lỗ hổng).

**[Doc3] `docs/` thiếu 2 file theo CLAUDE.md**
- **Vị trí:** `docs/` có `code-standards.md`, `codebase-summary.md`, `deployment-guide.md`, `system-architecture.md`. Thiếu `design-guidelines.md`, `project-roadmap.md`.
- **Trạng thái:** Đã kiểm chứng (`ls docs/`). INFO.

---

## 4. HÀNH ĐỘNG ƯU TIÊN

| # | ID | Hành động | File | Tác động |
|---|---|---|---|---|
| 1 | **S5** | Xoá 4 helper chết (hoặc comment "NOT WIRED") | `firestore.rules:18–47` | Khử foot-gun oversell tiềm ẩn |
| 2 | **C8** | Gom `minToHHmm` → `functions/format-helpers.js` | `functions/booking-handlers.js`, `functions/email-helpers.js` | DRY |
| 3 | **C10** | `any`→`unknown` | `src/admin/audit-tab.tsx:22` | Type safety |
| 4 | **C9** | Tách `calendar-step.tsx` (305→<200) | `src/booking/calendar-step.tsx` | Maintainability |
| 5 | **D3** | (Tuỳ chọn) bỏ rate-limit cancel | `functions/cancel-handler.js` | Dọn code thừa |
| 6 | **Doc3** | Thêm `design-guidelines.md` + `project-roadmap.md` | `docs/` | CLAUDE.md compliance |

---

## Lưu ý cho Codex

- **S5 là việc cần làm nhất** nhưng phải cẩn thận: chỉ XOÁ định nghĩa helper, KHÔNG đổi block `registrations`/`slots`/`config`. Sau khi xoá, chạy `npm run test:rules` (emulator) để chắc rules vẫn parse + hành vi không đổi.
- Sau mọi thay đổi: `npm run typecheck && npm test -- --run && npm run check:functions` phải xanh.
- KHÔNG đụng data live, KHÔNG deploy.

## Câu hỏi còn mở

1. **D3** — giữ hay bỏ rate-limit cancel? (vô hại nhưng là code thừa). Quyết định của team.
2. **S5** — xoá hẳn 4 helper, hay giữ + comment "NOT WIRED"? Khuyến nghị: xoá hẳn (ít foot-gun nhất).
