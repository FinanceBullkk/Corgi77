# Prompt Audit theo mảng — Corgi7 (11 module độc lập)

> **Cách dùng:** Mỗi mảng là 1 module độc lập. Chọn mảng cần audit → copy nguyên khối `--- PROMPT ---` của module đó → dán cho AI (hoặc chạy kèm `Skill` gợi ý). Mỗi prompt đã tự gói đủ bối cảnh, chạy riêng được.
>
> **Output chung mọi module:** điểm A–F của mảng · danh sách phát hiện `[ID] mức độ 🔴/🟠/🟡/🟢 · file:dòng · nguyên nhân gốc · cách sửa` · 1 câu kết luận thẳng · hành động ưu tiên. Phân biệt "đã kiểm chứng" vs "suy đoán". KHÔNG tạo cảm giác an toàn giả.
>
> **Bối cảnh dùng chung (mọi prompt giả định):** Corgi7 = SPA React (TS+Vite) client-only; Firestore làm DB; `firestore.rules` là backend thực thi duy nhất; lõi = đặt 2 ca thi (Speaking + 3 Skills) bằng transaction (capacity/quota/overlap); email ghi `/mail` cho extension; còn dấu vết legacy GAS trong README.

---

## Module 1 — Bảo mật (Security)

- **Mục tiêu:** Xác minh rules là thực thi thật; tìm lộ lọt, leo thang quyền, lộ PII.
- **Skill:** `/ck:ck-security` (quét secret nhanh: `/ck:security-scan`)
- **File đọc:** `firestore.rules` · `src/lib/admin.ts` · `src/lib/db.ts` · `src/lib/firebase.ts` · `firebase.json` · `.env.example`
- **Điểm nóng:** admin email hardcode (gồm gmail cá nhân) ở `firestore.rules` & `src/lib/admin.ts` · `onlyRemainingChanged()` có kẽ hở? · eligibility/ineligibility `get` vs `list` · deadline = `request.time`?

```
--- PROMPT ---
Bạn là chuyên gia bảo mật, audit khắt khe, không nể nang.
Hệ thống: Corgi7 — SPA React client-only, Firestore làm DB, Firestore Security Rules là backend thực thi DUY NHẤT (client chỉ là UX).
Nhiệm vụ: Audit BẢO MẬT. Đọc trước: firestore.rules, src/lib/admin.ts, src/lib/db.ts, src/lib/firebase.ts, firebase.json, .env.example.
Khung STRIDE + OWASP. Soi đặc biệt:
 1) Rules có thật sự chặn ghi trái phép? (chỉ owner ghi registration của mình; chỉ admin ghi config/slots; remaining luôn trong [0, capacity])
 2) onlyRemainingChanged()/validation có lỗ cho client ghi field tuỳ ý không?
 3) Lộ PII/allowlist: eligibility & ineligibility có phân quyền get (user) vs list (chỉ admin)?
 4) Hardcode secret / admin email / API key trong source?
 5) Authz & deadline dựa server-time (request.time) hay client-time?
Với MỖI phát hiện: [Sx] mức độ 🔴/🟠/🟡/🟢 · file:dòng · nguyên nhân gốc · cách sửa cụ thể.
Phân biệt "đã kiểm chứng (đọc rules)" vs "suy đoán cần xác minh".
Kết thúc: điểm A–F + 1 câu kết luận thẳng + checklist hành động ưu tiên.
KHÔNG tạo cảm giác an toàn giả; phòng thủ nào chỉ là UX (client) phải nói rõ.
--- HẾT PROMPT ---
```

---

## Module 2 — Giao dịch & Concurrency

- **Mục tiêu:** Chứng minh hệ thống không oversell chỗ cuối & không trùng giờ khi tranh chấp.
- **Skill:** `/ck:code-review` + `/ck:ck-scenario`
- **File đọc:** `src/lib/db.ts` (transaction `bookDb`/`cancelDb`) · `src/__tests__/security.test.ts` · `src/__tests__/db.test.ts`
- **Điểm nóng:** thứ tự đọc-trước-ghi · oversell chỗ cuối · retry optimistic-lock có được test? · quota F14 · no-op F13 · overlap 2 ca trùng giờ.

```
--- PROMPT ---
Bạn là kỹ sư review giao dịch dữ liệu, khắt khe.
Hệ thống: Corgi7 — đặt 2 ca thi (Speaking + 3 Skills) qua Firestore runTransaction. Sức chứa slot.remaining, hạn ngạch đổi ca, chống trùng giờ.
Nhiệm vụ: Audit TÍNH ĐÚNG GIAO DỊCH & CONCURRENCY. Đọc: src/lib/db.ts (bookDb, cancelDb, checkIneligibility) và các test src/__tests__/security.test.ts, db.test.ts.
Soi đặc biệt:
 1) Mọi read có nằm TRƯỚC mọi write trong transaction không (yêu cầu của Firestore)? Liệt kê thứ tự read thực tế.
 2) Khi 2 user giành slot remaining=1: có cơ chế chặn oversell? optimistic-lock retry (version đổi → đọc lại) có được mô phỏng trong test, hay test chỉ chạy fn 1 lần?
 3) Quota khi huỷ (F14) & no-op khi book trùng selection (F13) xử lý đúng?
 4) Overlap: 2 ca cùng user trùng khung giờ có bị chặn ở cả client lẫn (nếu có) rules?
 5) Lỗi giữa chừng transaction có để lại remaining sai vĩnh viễn không?
Với MỖI phát hiện: [Cx] mức độ 🔴/🟠/🟡/🟢 · file:dòng · nguyên nhân gốc · cách sửa.
Nếu một test TÊN là "concurrency" nhưng không thật sự tạo tranh chấp → nêu rõ là "an toàn giả".
Kết thúc: điểm A–F + kết luận thẳng + hành động ưu tiên.
--- HẾT PROMPT ---
```

---

## Module 3 — Nghiệp vụ / Luồng

- **Mục tiêu:** Kiểm tra logic đăng ký/đổi/huỷ & eligibility/deadline đúng và không có lỗ biên.
- **Skill:** `/ck:code-review` + `/ck:ck-scenario`
- **File đọc:** `src/lib/db.ts` · `src/App.tsx` · `src/booking/*`
- **Điểm nóng:** eligibility "lỗi mạng vs chắc chắn không chặn" · deadline/`allowEnrollment` · suy luận `changeCount` (đăng ký lại sau huỷ không tốn lượt).

```
--- PROMPT ---
Bạn là chuyên gia nghiệp vụ booking, soi lỗ hổng luồng.
Hệ thống: Corgi7 — học viên đăng ký 2 ca thi, được đổi tối đa maxChanges lần; có eligibility (danh sách hợp lệ) + ineligibility (chặn) + deadline + cờ allowEnrollment.
Nhiệm vụ: Audit NGHIỆP VỤ & LUỒNG. Đọc: src/lib/db.ts, src/App.tsx, src/booking/*.
Soi đặc biệt:
 1) checkIneligibility khi lỗi mạng trả null (coi như không chặn) — có phân biệt được "không chặn vì mạng lỗi" với "chắc chắn hợp lệ"? Hệ quả UX khi rules vẫn chặn ở bước ghi?
 2) deadline (server-time) + allowEnrollment=false: mọi book/cancel có bị từ chối đúng?
 3) changeCount chỉ tăng khi đổi slot của reg đang tồn tại; đăng ký lại sau huỷ KHÔNG tốn lượt — logic này đúng & nhất quán giữa client và rules?
 4) Biên: slot bị admin xoá sau khi user đã đặt; user mở 2 tab; bấm nhanh 2 lần.
Với MỖI phát hiện: [Wx] mức độ 🔴/🟠/🟡/🟢 · file:dòng · nguyên nhân gốc · cách sửa.
Kết thúc: điểm A–F + kết luận thẳng + hành động ưu tiên.
--- HẾT PROMPT ---
```

---

## Module 4 — Kiến trúc & Code

- **Mục tiêu:** Đánh giá module hoá, lớp lang, nợ kỹ thuật sau khi đã tách monolith.
- **Skill:** `/ck:code-review`
- **File đọc:** `src/App.tsx` · `src/AdminPanel.tsx` · `src/lib/*` · `src/admin/*` · `src/booking/*`
- **Điểm nóng:** ranh giới module · UI gọi thẳng db (không lớp service) · `any`/`console.*` · DRY · file >200 dòng.

```
--- PROMPT ---
Bạn là kiến trúc sư phần mềm, review chất lượng code không khoan nhượng.
Hệ thống: Corgi7 — React+TS client-only; lib/ (db, adminDb, admin, audit, types) tách khỏi UI; App.tsx và AdminPanel.tsx đã được tách thành booking/* và admin/*.
Nhiệm vụ: Audit KIẾN TRÚC & CODE. Đọc: src/App.tsx, src/AdminPanel.tsx, src/lib/*, src/admin/*, src/booking/*, src/components/*.
Soi đặc biệt:
 1) Ranh giới module sau khi tách có rõ không, hay vẫn còn file ôm quá nhiều việc (>200 dòng)?
 2) Có lớp service giữa UI và Firestore, hay component gọi thẳng db.ts/adminDb.ts? Hệ quả test/maintain?
 3) Lặp code (DRY) giữa booking/* và admin/*; helper format có gom vào lib chưa?
 4) `any`, `console.*`, dead code, import thừa.
 5) Theo nguyên tắc YAGNI/KISS/DRY — chỗ nào over-engineer hoặc thiếu trừu tượng?
Với MỖI phát hiện: [Ax] mức độ 🔴/🟠/🟡/🟢 · file:dòng · nguyên nhân gốc · cách sửa.
Kết thúc: điểm A–F + kết luận thẳng + hành động ưu tiên (refactor nào đáng làm trước).
--- HẾT PROMPT ---
```

---

## Module 5 — Kiểm thử (Testing)

- **Mục tiêu:** Phát hiện test "nói dối" (đặt tên concurrency nhưng không test concurrency), mock giòn, thiếu CI.
- **Skill:** `/ck:test` + `/ck:ck-scenario`
- **File đọc:** `src/__tests__/*` · `package.json` · `vitest.config.ts` · `.github/workflows/`
- **Điểm nóng:** test concurrency có thật? · mock theo doc path hay theo vị trí hàng đợi · coverage đường-tiền · CI chặn merge (hiện chỉ có `deploy.yml`).

```
--- PROMPT ---
Bạn là kỹ sư kiểm thử, soi bộ test có "nói dối" không.
Hệ thống: Corgi7 — vitest + jsdom; test phủ db.ts (book/cancel/eligibility), rules-mock, admin.
Nhiệm vụ: Audit KIỂM THỬ. Chạy `npx vitest run` nếu được; đọc src/__tests__/*, package.json, vitest.config.ts, .github/workflows/.
Soi đặc biệt:
 1) Test có tên/ý "concurrency": chúng có THẬT SỰ tạo tranh chấp (2 giao dịch đua, retry, abort-rồi-đọc-lại) hay chỉ chạy hàm 1 lần với hàng đợi mock nạp sẵn? Nếu giả → đánh dấu "an toàn giả".
 2) Mock định danh theo doc PATH (config/main, registrations/{email}…) hay theo VỊ TRÍ trong hàng đợi (giòn, vỡ khi đổi thứ tự read)?
 3) Coverage phần tiền: capacity, quota (maxChanges), overlap — có test bảo vệ đủ?
 4) Có workflow CI chạy test + tsc để CHẶN MERGE khi đỏ không? (repo hiện chỉ thấy deploy.yml)
 5) Có test nào đang đỏ / skip ẩn / assertion yếu (chỉ toBeTruthy) không?
Với MỖI phát hiện: [Tx] mức độ 🔴/🟠/🟡/🟢 · file:dòng · nguyên nhân gốc · cách sửa.
Kết thúc: điểm A–F + kết luận thẳng (bộ test có đáng tin?) + hành động ưu tiên.
--- HẾT PROMPT ---
```

---

## Module 6 — Hiệu năng & Bundle

- **Mục tiêu:** Tìm chi phí thừa: bundle, Firestore read/write, re-render.
- **Skill:** `/ck:react-best-practices` + `/ck:code-review`
- **File đọc:** `vite.config.ts` · `src/AdminPanel.tsx` · `src/lib/adminDb.ts` · `src/App.tsx`
- **Điểm nóng:** code-split admin · admin refetch-all mỗi mutation · chi phí read/write Firestore · re-render thừa.

```
--- PROMPT ---
Bạn là kỹ sư hiệu năng frontend + chi phí Firestore.
Hệ thống: Corgi7 — React client-only, Firestore; admin panel tải nhiều dữ liệu.
Nhiệm vụ: Audit HIỆU NĂNG & BUNDLE. Chạy `npm run build` nếu được; đọc vite.config.ts, src/AdminPanel.tsx, src/lib/adminDb.ts, src/App.tsx.
Soi đặc biệt:
 1) AdminPanel có được lazy-load / code-split khỏi đường người dùng thường không? Kích thước chunk đường-booking?
 2) Admin có Promise.all reload TOÀN BỘ (slots+registrations+config+ineligibility) sau MỖI mutation không? Hệ quả chi phí read khi vài trăm–nghìn bản ghi.
 3) Refetch có mục tiêu / cập nhật lạc quan thay vì tải lại tất cả?
 4) Re-render thừa: list không key ổn định, hàm/inline-object tạo mới mỗi render, thiếu memo ở chỗ nặng.
 5) Ghi Firestore: có batch/transaction hợp lý hay nhiều op lẻ?
Với MỖI phát hiện: [Px] mức độ 🔴/🟠/🟡/🟢 · file:dòng · nguyên nhân gốc · cách sửa (kèm ước lượng lợi ích nếu có).
Kết thúc: điểm A–F + kết luận thẳng + hành động ưu tiên.
--- HẾT PROMPT ---
```

---

## Module 7 — UX/UI & Accessibility

- **Mục tiêu:** Soi điểm gãy trải nghiệm & rào cản tiếp cận.
- **Skill:** `/ck:web-design-guidelines`
- **File đọc:** `src/booking/*` · `src/admin/*` · `src/confirm-toast-provider.tsx` · `src/components/modal.tsx`
- **Điểm nóng:** auto-nhảy tab có phản hồi? · empty/error states · role/aria/tương phản · mobile · nhất quán modal (đã bỏ confirm()/alert()?).

```
--- PROMPT ---
Bạn là chuyên gia UX/UI & accessibility, review thẳng thắn.
Hệ thống: Corgi7 — app đặt ca thi cho học viên + panel admin. Tiếng Việt.
Nhiệm vụ: Audit UX/UI & A11Y. Đọc: src/booking/*, src/admin/*, src/confirm-toast-provider.tsx, src/components/modal.tsx.
Soi đặc biệt:
 1) Sau khi chọn 1 ca, hệ thống tự nhảy sang tab loại còn lại — có phản hồi rõ (toast/nhấn mạnh "Đã chọn Speaking ✓, giờ chọn 3 Skills") hay gây mất phương hướng?
 2) Empty states & error states có đủ 2 tầng (rỗng / lỗi) và hướng dẫn hành động?
 3) A11y: role, aria-label, focus order, tương phản màu (đặc biệt chữ trên nền cảnh báo), bàn phím, trap focus trong modal.
 4) Mobile: chạm, kích thước target, layout co giãn.
 5) Xác nhận hành động có NHẤT QUÁN dùng modal/toast của app không, hay còn confirm()/alert() native (chặn luồng, không style được)?
Với MỖI phát hiện: [Xx] mức độ 🔴/🟠/🟡/🟢 · file:dòng · nguyên nhân gốc · cách sửa.
Kết thúc: điểm A–F + kết luận thẳng + hành động ưu tiên.
--- HẾT PROMPT ---
```

---

## Module 8 — Nội dung & i18n

- **Mục tiêu:** Đảm bảo chữ nghĩa trung thực, rõ, đúng giọng tiếng Việt.
- **Skill:** `/ck:copywriting`
- **File đọc:** `src/booking/success-screen.tsx` · các chuỗi hiển thị trong `src/booking/*`, `src/admin/*`
- **Điểm nóng:** nhãn trung thực (email "đang gửi" vs "đã gửi") · thông báo lỗi rõ nghĩa · chính tả/giọng VN.

```
--- PROMPT ---
Bạn là biên tập viên sản phẩm (UX writing) tiếng Việt, khó tính.
Hệ thống: Corgi7 — app đặt ca thi, toàn bộ chữ hiển thị tiếng Việt.
Nhiệm vụ: Audit NỘI DUNG & I18N. Đọc các chuỗi trong src/booking/* (đặc biệt success-screen.tsx), src/admin/*.
Soi đặc biệt:
 1) Nhãn có HỨA QUÁ không? VD email mới "xếp hàng" mà báo "đã gửi" → sai sự thật. Có chỗ nào tương tự?
 2) Thông báo lỗi: có rõ nguyên nhân + hành động kế tiếp, hay thô/kỹ thuật (lọt message permission của Firestore)?
 3) Chính tả, dấu, giọng văn nhất quán (xưng hô, mức trang trọng)?
 4) Thuật ngữ nhất quán (ca thi / slot / đổi ca…)?
Với MỖI phát hiện: [Nx] mức độ 🔴/🟠/🟡/🟢 · file:dòng · vấn đề · đề xuất câu chữ thay thế.
Kết thúc: điểm A–F + kết luận thẳng + danh sách sửa chữ ưu tiên.
--- HẾT PROMPT ---
```

---

## Module 9 — Data Model & Integrity

- **Mục tiêu:** Kiểm tra mô hình dữ liệu nhất quán & không sinh rác/orphan.
- **Skill:** `/ck:databases` + `/ck:code-review`
- **File đọc:** `src/lib/types.ts` · `firestore.rules` · `src/lib/db.ts` · `src/lib/adminDb.ts` · `README.md`
- **Điểm nóng:** schema nhất quán types↔rules↔data · orphan record khi xoá slot · drift GAS↔Firebase · ràng buộc field.

```
--- PROMPT ---
Bạn là chuyên gia mô hình dữ liệu.
Hệ thống: Corgi7 — Firestore collections: config/main, slots, registrations, eligibility, ineligibility, mail, audit. Schema khai trong src/lib/types.ts; ràng buộc thực thi ở firestore.rules.
Nhiệm vụ: Audit DATA MODEL & INTEGRITY. Đọc: src/lib/types.ts, firestore.rules, src/lib/db.ts, src/lib/adminDb.ts, README.md.
Soi đặc biệt:
 1) Định nghĩa type (types.ts) có khớp field rules kiểm tra & dữ liệu thực ghi không? Field optional vs bắt buộc rõ ràng?
 2) Orphan: admin xoá slot đã có registration trỏ tới → xử lý thế nào? Có chặn / cảnh báo / dọn không?
 3) Drift mô hình GAS (Google Sheet, cột cố định) vs Firebase (Firestore) trong README — phần nào đã lỗi thời?
 4) Ràng buộc liên-document (reg.speakingSlotId phải trỏ slot type Speaking) được đảm bảo ở đâu (client/rules/không)?
 5) ID quy ước (empCode 6 số làm doc id…) có nhất quán & kiểm tra?
Với MỖI phát hiện: [Dx] mức độ 🔴/🟠/🟡/🟢 · file:dòng · nguyên nhân gốc · cách sửa.
Kết thúc: điểm A–F + kết luận thẳng + hành động ưu tiên.
--- HẾT PROMPT ---
```

---

## Module 10 — Error Handling & Observability

- **Mục tiêu:** Tìm chỗ nuốt lỗi & thiếu khả năng quan sát khi production hỏng.
- **Skill:** `/ck:ck-debug`
- **File đọc:** `src/components/error-boundary.tsx` · `src/lib/db.ts` · `src/lib/adminDb.ts` · `src/confirm-toast-provider.tsx`
- **Điểm nóng:** nuốt lỗi (catch→null) · không monitoring · log chỉ `console.*` · lỗi thô tới user.

```
--- PROMPT ---
Bạn là kỹ sư độ tin cậy (reliability), soi xử lý lỗi.
Hệ thống: Corgi7 — client-only; lỗi production chỉ thấy nếu được bắt & báo đúng.
Nhiệm vụ: Audit ERROR HANDLING & OBSERVABILITY. Đọc: src/components/error-boundary.tsx, src/lib/db.ts, src/lib/adminDb.ts, src/confirm-toast-provider.tsx và các chỗ try/catch.
Soi đặc biệt:
 1) Chỗ nào NUỐT lỗi (catch rồi trả null/đi tiếp im lặng, vd checkIneligibility)? Hệ quả: lỗi thật bị giấu?
 2) Phân biệt lỗi mạng vs lỗi nghiệp vụ vs lỗi quyền khi hiển thị cho user?
 3) Có lớp log/monitoring (Sentry…) hay chỉ console.* (mất khi production)?
 4) ErrorBoundary phủ tới đâu? Lỗi async/ngoài render có lọt không?
 5) Message lỗi thô (permission-denied của Firestore) có lọt thẳng tới user không?
Với MỖI phát hiện: [Ex] mức độ 🔴/🟠/🟡/🟢 · file:dòng · nguyên nhân gốc · cách sửa.
Kết thúc: điểm A–F + kết luận thẳng + hành động ưu tiên.
--- HẾT PROMPT ---
```

---

## Module 11 — Tài liệu (Documentation)

- **Mục tiêu:** Phát hiện tài liệu lỗi thời / sai lệch với code thực tế.
- **Skill:** `/ck:docs`
- **File đọc:** `README.md` · `PROMPT-*.md` · `firestore.rules` · `package.json` · (kiểm tra có `docs/`?)
- **Điểm nóng:** README drift (mô tả GAS nhưng code Firebase) · quy trình eligibility/import · thiếu `docs/`.

```
--- PROMPT ---
Bạn là người quản lý tài liệu kỹ thuật, đối chiếu doc với code thật.
Hệ thống: Corgi7 — đang chạy Firebase mode (Firestore + rules) NHƯNG README mô tả chủ yếu legacy GAS/Google-Sheet.
Nhiệm vụ: Audit TÀI LIỆU. Đọc: README.md, các PROMPT-*.md, firestore.rules, package.json; kiểm tra có thư mục docs/ không.
Soi đặc biệt:
 1) README có phần nào MÔ TẢ GAS/Google-Sheet trong khi hệ thống thật là Firebase? Liệt kê đoạn lỗi thời.
 2) Hướng dẫn setup (admin email, eligibility, deadline, import) có khớp code/rules hiện tại?
 3) Có thiếu tài liệu nên có (docs/ codebase-summary, system-architecture, deployment) không?
 4) Lệnh build/deploy trong README còn đúng với package.json & .github/workflows/?
Với MỖI phát hiện: [Docx] mức độ 🔴/🟠/🟡/🟢 · file:dòng · sai lệch gì · cách sửa.
Kết thúc: điểm A–F + kết luận thẳng + danh sách cập nhật tài liệu ưu tiên.
--- HẾT PROMPT ---
```

---

## Phụ lục — Bảng tra nhanh mảng → skill

| # | Mảng | Skill |
|---|------|-------|
| 1 | Bảo mật | `/ck:ck-security`, `/ck:security-scan` |
| 2 | Giao dịch & concurrency | `/ck:code-review`, `/ck:ck-scenario` |
| 3 | Nghiệp vụ / luồng | `/ck:code-review`, `/ck:ck-scenario` |
| 4 | Kiến trúc & code | `/ck:code-review` |
| 5 | Kiểm thử | `/ck:test`, `/ck:ck-scenario` |
| 6 | Hiệu năng & bundle | `/ck:react-best-practices`, `/ck:code-review` |
| 7 | UX/UI & a11y | `/ck:web-design-guidelines` |
| 8 | Nội dung & i18n | `/ck:copywriting` |
| 9 | Data model & integrity | `/ck:databases`, `/ck:code-review` |
| 10 | Error handling & observability | `/ck:ck-debug` |
| 11 | Tài liệu | `/ck:docs` |
