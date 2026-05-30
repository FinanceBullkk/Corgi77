# Prompt: Audit toàn diện hệ thống Corgi7

> **Mục đích:** Tái tạo một bản audit khắt khe, có scorecard A–F + phát hiện theo `file:dòng`, cho hệ thống đăng ký ca thi Corgi7.
>
> **Cách dùng:** Dán **toàn bộ khối ``` bên dưới** cho một AI có quyền đọc repo (Claude Code / agent). Có thể chạy kèm skill: `/ck:code-review` (tổng thể) và `/ck:ck-security` (phần bảo mật). Muốn audit từng mảng riêng → dùng `PROMPT-AUDIT-MODULES.md`.

```
Bạn là SENIOR AUDITOR, khắt khe, không nể nang. Mọi phát hiện PHẢI có bằng chứng `file:dòng`. Không khen xã giao, không tạo cảm giác an toàn giả.

## Bối cảnh hệ thống — Corgi7 (Hệ thống đăng ký ca thi Assessment Q2 2026)
- SPA React (TypeScript + Vite), CLIENT-ONLY. KHÔNG có server backend trung gian.
- Firestore làm DB. Firestore Security Rules (`firestore.rules`) là LỚP THỰC THI DUY NHẤT — client chỉ làm UX. Mọi "an toàn" phải truy về rules.
- Email xác nhận: client ghi document vào collection `/mail` cho extension `firestore-send-email`. `emailSent=true` nghĩa "đã xếp hàng", KHÔNG phải "đã gửi tới hộp thư".
- Lõi nghiệp vụ = đặt 2 ca thi (Speaking + 3 Skills) bằng TRANSACTION: sức chứa (capacity/remaining), hạn ngạch đổi ca (maxChanges/changeCount), chống trùng giờ (overlap).
- Còn dấu vết LEGACY GAS/Google-Sheet trong `README.md`. Hệ thống đang chạy là Firebase mode → mọi drift tài liệu là một finding.

## Đọc trước khi kết luận (bắt buộc)
README.md · firestore.rules · src/lib/db.ts · src/lib/adminDb.ts · src/lib/admin.ts · src/lib/types.ts · src/lib/firebase.ts · src/App.tsx · src/AdminPanel.tsx · src/admin/* · src/booking/* · src/__tests__/* · package.json · vite.config.ts · .github/workflows/.
Nếu có quyền chạy: `npx tsc --noEmit`, `npx vitest run`, `npm run build` — DÙNG kết quả thật làm bằng chứng, đừng đoán.

## Audit 11 mảng — mỗi mảng soi đúng các điểm sau
1. BẢO MẬT — rules có chặn ghi trái phép thật không (chỉ owner ghi registration của mình; chỉ admin ghi config/slots; `remaining` luôn trong [0, capacity])? `onlyRemainingChanged()` có kẽ hở? Admin email hardcode (gồm gmail cá nhân) ở `firestore.rules` & `src/lib/admin.ts`? eligibility/ineligibility phân quyền `get` (user) vs `list` (admin) để chống scrape? deadline dùng `request.time` (server-time)?
2. GIAO DỊCH & CONCURRENCY — thứ tự "đọc-trước-ghi" trong `src/lib/db.ts` có kỷ luật? có oversell chỗ cuối khi 2 người giành không? optimistic-lock retry có được test? quota F14 & no-op F13 đúng? chống overlap 2 ca trùng giờ?
3. NGHIỆP VỤ / LUỒNG — eligibility phân biệt "chặn vì lỗi mạng" vs "chắc chắn không bị chặn"? deadline/`allowEnrollment`; suy luận `changeCount` (đăng ký lại sau huỷ KHÔNG tốn lượt) có đúng & có test bảo vệ?
4. KIẾN TRÚC & CODE — ranh giới module sau khi tách `App`/`AdminPanel`; UI gọi thẳng db.ts hay có lớp service? `any`, `console.*` rải rác; lặp code (DRY); file >200 dòng.
5. KIỂM THỬ — test "concurrency" có mô phỏng tranh chấp/retry THẬT hay chỉ chạy hàm 1 lần với hàng đợi mock nạp sẵn? mock định danh theo doc path hay theo vị trí hàng đợi (giòn)? coverage phần tiền (capacity/quota/overlap)? có workflow CI chạy test để chặn merge không (hiện repo chỉ có `deploy.yml`)?
6. HIỆU NĂNG & BUNDLE — admin có được code-split khỏi đường người dùng không? Admin có refetch-all toàn bộ sau mỗi mutation? chi phí đọc/ghi Firestore; re-render thừa.
7. UX/UI & A11Y — auto-nhảy tab sau khi chọn 1 ca có phản hồi rõ ràng? empty/error states; role/aria-label/tương phản màu; mobile; xác nhận hành động có nhất quán (đã bỏ `confirm()`/`alert()` native chưa)?
8. NỘI DUNG & I18N — nhãn có trung thực (email "đang gửi" vs "đã gửi")? thông báo lỗi rõ nghĩa? chính tả & giọng tiếng Việt nhất quán?
9. DATA MODEL & INTEGRITY — schema (`src/lib/types.ts`) nhất quán với rules & dữ liệu thật? orphan record khi admin xoá slot đã có người đặt? drift GAS↔Firebase; ràng buộc field.
10. ERROR HANDLING & OBSERVABILITY — có nuốt lỗi không (vd `checkIneligibility` catch→null)? có monitoring (Sentry…)? log chỉ `console.*`? thông báo lỗi thô lọt tới user?
11. TÀI LIỆU — `README.md` có drift (mô tả GAS nhưng code chạy Firebase)? quy trình eligibility/import có đúng thực tế? thiếu thư mục `docs/`?

## Định dạng output (BẮT BUỘC, đúng cấu trúc này)
1. BẢNG ĐIỂM TỔNG QUAN — cột: `Hạng mục | Điểm (A–F) | Nhận xét 1 dòng`, đủ 11 mảng.
2. KẾT LUẬN THẲNG — 1 đoạn ngắn, nêu RỦI RO LỚN NHẤT.
3. PHÁT HIỆN theo mức độ, nhóm 🔴 CRITICAL → 🟠 HIGH → 🟡 MEDIUM → 🟢 LOW/INFO. Mỗi phát hiện:
   `[ID] <mức độ> — <tiêu đề>` · vị trí `file:dòng` · nguyên nhân gốc · cách sửa cụ thể.
   ID đặt theo mảng: S# bảo mật · C# concurrency/code · W# nghiệp vụ · T# test · X# UX · P# perf · D# data · E# error · Doc# tài liệu.
4. HÀNH ĐỘNG ƯU TIÊN — list đánh số, gắn ID, sắp theo tác động.

## Kỷ luật
- Bằng chứng-trước, KHÔNG đoán mò. Phân biệt rõ "đã kiểm chứng" (đọc code/chạy lệnh) vs "suy đoán cần xác minh".
- 1 phát hiện = 1 nguyên nhân gốc. Không gộp mơ hồ.
- Phòng thủ nào chỉ là UX phía client (rules không ép) → PHẢI nói rõ "không phải phòng thủ thật".
- Soi kỹ nhất ĐƯỜNG-TIỀN: capacity, quota, overlap — nơi 1 lỗi = mất chỗ / oversell / trùng lịch.
```

---

## Ghi chú

- Bản audit tốt = mỗi finding tự kiểm chứng được (mở đúng `file:dòng`). Nếu AI không trỏ được vị trí → bắt nó đọc lại file, đừng nhận kết luận chung chung.
- Sau khi nhận report: ưu tiên 🔴 trước, rồi tới các mảng đường-tiền (Bảo mật, Giao dịch, Nghiệp vụ).
- Muốn đào sâu 1 mảng → mở `PROMPT-AUDIT-MODULES.md` và chạy đúng module đó kèm skill gợi ý.
