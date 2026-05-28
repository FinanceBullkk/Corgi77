# Audit Report: Assessment Booking Q2 2026

## Tổng quan

Audit toàn diện trên 3 góc độ: **Tính năng**, **User Experience**, **Admin Operations**. Mỗi mục đánh giá Mức độ nghiêm trọng (P0: phải sửa trước khi launch, P1: nên sửa sớm, P2: nice-to-have) và trạng thái (✅ Đã sửa, ⬜ Cần làm thêm).

---

## 1. TÍNH NĂNG (Features & Edge Cases)

### 1.1 ✅ [P0] Không có khoá khẩn cấp (kill-switch)

**Vấn đề**: Chỉ dựa vào deadline. Không có cách nào dừng đăng ký ngay lập tức khi có sự cố.

**Đã sửa**: Thêm `allow_enrollment` vào sheet Config. Server kiểm tra trước cả deadline. Admin set `FALSE` → mọi request book/cancel bị từ chối ngay lập tức.

**File thay đổi**: `gas/Code.js` (hàm `book`, `cancel`, `init`, `readConfig_`)

---

### 1.2 ✅ [P0] Không kiểm soát eligibility (ai được đăng ký?)

**Vấn đề**: Bất kỳ ai có email `@cyberlogitec.com` đều đăng ký được, kể cả CTV, nhân viên nghỉ việc, hoặc người không thuộc diện thi.

**Đã sửa**: Thêm sheet `Eligibility` với danh sách email hợp lệ. Server check trước khi cho phép book. Sheet trống → fallback cho phép tất (backward compatible cho giai đoạn test).

**File thay đổi**: `gas/Code.js` (hàm `book`), `sheet-templates/Eligibility.csv`

---

### 1.3 ✅ [P0] Không có confirm dialog khi submit

**Vấn đề**: Nút "Đăng ký" không hỏi lại. Nhấp nhầm → đăng ký ngay.

**Đã sửa**: 
- Đăng ký mới: hiển thị confirm dialog tóm tắt Họ tên, Mã NV, BU, 2 ca đã chọn.
- Đổi ca: hiển thị old → new cho cả 2 ca.

**File thay đổi**: `src/App.tsx` (hàm `handleSubmit`)

---

### 1.4 ✅ [P1] Validation Mã NV / Họ tên / BU quá yếu

**Vấn đề**: Chỉ check `required` (trống). Cho phép nhập space, ký tự đặc biệt, Mã NV không đúng format.

**Đã sửa**:
- Mã NV: tối thiểu 3 ký tự sau khi trim.
- Họ tên: tối thiểu 2 ký tự sau khi trim.
- BU: tối thiểu 2 ký tự sau khi trim.
- Server-side: max length check (empCode 20, fullName 100, bu 50).

**File thay đổi**: `src/App.tsx`, `gas/Code.js`

---

### 1.5 ✅ [P1] Email xác nhận không biết đã gửi chưa

**Vấn đề**: Banner không nói rõ email đã gửi hay không. Server trả `emailSent` nhưng client bỏ qua.

**Đã sửa**: Banner phân biệt "Email xác nhận đã được gửi." vs "(Không gửi được email xác nhận.)"

**File thay đổi**: `src/App.tsx`

---

### 1.6 ✅ [P1] Email xác nhận thiếu thông tin

**Vấn đề**: Email chỉ có slotId + ngày + giờ. Không có Mã NV, Họ tên, BU, location, link đổi ca.

**Đã sửa**: Email template mới bao gồm: Mã NV, Họ tên, BU, Speaking (ngày + giờ + location), 3 Skills (ngày + giờ + location), link đổi/huỷ, ghi chú giới hạn đổi 3 lần.

**File thay đổi**: `gas/Code.js` (hàm `sendConfirmEmail_`)

---

### 1.7 ✅ [P1] Audit log chỉ ghi vào console.log

**Vấn đề**: Audit log dạng JSON trong console, rất khó tìm kiếm, filter, hay thống kê.

**Đã sửa**: Thêm sheet `AuditLog` với 11 cột chi tiết. Ghi vào sheet ngay sau mỗi sự kiện (không blocking). Các event: `book.create`, `book.update`, `cancel`, `book.rejected.*`.

**File thay đổi**: `gas/Code.js` (hàm `audit_`), `sheet-templates/AuditLog.csv`

---

### 1.8 ✅ [P1] Slot hiển thị chỉ có ID, không có địa điểm

**Vấn đề**: Học viên thấy "SP-2206-1330" thay vì "Phòng A".

**Đã sửa**: Thêm cột `location` vào sheet Slots. Hiển thị 📍 địa điểm trong slot card và booking display.

**File thay đổi**: `gas/Code.js`, `src/lib/gas.ts`, `src/lib/mockData.ts`, `src/App.tsx`, `sheet-templates/Slots.csv`

---

### 1.9 ✅ [P1] Không có giới hạn đổi ca (abuse prevention)

**Vấn đề**: Học viên có thể đổi ca liên tục nhiều lần, tạo nhiều audit log entries.

**Đã sửa**:
- Thêm cột `change_count` vào sheet Registrations (vị trí 9).
- Thêm `max_changes` vào sheet Config (default: 3).
- Server kiểm tra trước khi cho phép update. Khi đạt giới hạn → reject + audit log `book.rejected.change_limit`.
- Frontend hiển thị số lần đã đổi / tối đa, cảnh báo khi gần đạt giới hạn, disable nút khi đạt max.
- Confirm dialog hiển thị "(Lần đổi X/Y)" khi đổi ca.

**File thay đổi**: `gas/Code.js`, `src/App.tsx`, `src/lib/gas.ts`, `src/lib/mockData.ts`, `sheet-templates/Registrations.csv`, `sheet-templates/Config.csv`

---

### 1.10 ⬜ [P2] Không có bulk admin operations

**Vấn đề**: Admin không thể huỷ hàng loạt (VD: khi cần đổi lịch thi cho cả 1 ca). Phải vào từng dòng Sheet xóa thủ công.

**Khuyến nghị**: Thêm hàm `adminBulkCancel(slotId)` cho phép admin huỷ tất cả booking trong 1 slot. Kèm email thông báo cho các HV bị ảnh hưởng.

---

## 2. USER EXPERIENCE

### 2.1 ✅ [P0] Thông báo lỗi/thành công mờ quá nhanh

**Vấn đề**: Banner auto-dismiss quá nhanh, lỗi biến mất trước khi HV kịp đọc.

**Đã sửa**: Success 10s, Error/Info 8s. Banner có nút đóng × rõ ràng.

**File thay đổi**: `src/App.tsx`

---

### 2.2 ✅ [P0] Hiển thị slot chỉ có slotId

**Vấn đề**: Booking display hiện raw slotId thay vì thông tin có ý nghĩa.

**Đã sửa**: 
- Booking display: `[AM] 22/06/2026 · 13:30–14:30 · Phòng A`
- Slot card: hiển thị 📍 Phòng A thay vì slotId
- Thêm "Đăng ký lúc" / "Cập nhật lúc" timestamp

**File thay đổi**: `src/App.tsx`

---

### 2.3 ✅ [P1] Không có trạng thái "đang lưu"

**Vấn đề**: Khi submit trên mạng chậm, nút bấm không có feedback rõ ràng.

**Đã sửa**: Nút submit hiển thị spinner + "Đang gửi…", disable trong khi đang gửi. Cancel cũng có "Đang hủy…".

---

### 2.4 ✅ [P1] Thiếu thông tin "Bạn có thể đổi ca" sau khi đăng ký

**Vấn đề**: Sau khi đăng ký thành công, HV không biết mình vẫn có thể đổi/huỷ trước deadline.

**Đã sửa**: 
- Confirm dialog có dòng "Bạn có thể đổi ca hoặc hủy trước hạn đăng ký."
- Booking display hiển thị "(Còn X lần đổi)" khi chưa đạt max.
- Warning "Đã hết lượt đổi" khi đạt max.

---

### 2.5 ⬜ [P2] Không có mobile-specific UX

**Vấn đề**: CSS responsive cơ bản đã có nhưng chưa tối ưu cho mobile.

**Khuyến nghị**: Test trên mobile viewport.

---

### 2.6 ⬜ [P2] Không có progress indicator

**Vấn đề**: Form dài 3 bước nhưng không có breadcrumb/step indicator rõ ràng.

**Khuyến nghị**: Thêm step indicator ở đầu form (1 → 2 → 3) với highlight bước hiện tại.

---

## 3. ADMIN OPERATIONS

### 3.1 ✅ [P0] Không có cách xem "Ai chưa đăng ký?"

**Vấn đề**: Sheet Registrations chỉ show người ĐÃ đăng ký.

**Đã sửa**: Hàm `refreshAdminSummary()` trong Code.js tạo sheet `AdminSummary` với tổng quan: Registered / Not Registered / Slot fill % / Registered list / Not Registered list (cần nhắc nhở).

**File thay đổi**: `gas/Code.js`

---

### 3.2 ✅ [P0] Không có thống kê nhanh

**Vấn đề**: Admin phải đếm tay trong Sheet.

**Đã sửa**: `refreshAdminSummary()` tạo bảng OVERVIEW + SLOT SUMMARY với emoji status (🟢 OK / 🟡 LOW / 🔴 FULL) + Registered by slot breakdown.

---

### 3.3 ✅ [P1] Audit log khó tra cứu

**Vấn đề**: Audit log trong console.log không thể filter, search, hay export.

**Đã sửa**: Sheet `AuditLog` với đầy đủ 11 cột. Admin có thể dùng filter/QUERY trong Google Sheet để tra cứu.

---

### 3.4 ✅ [P1] Lint() không kiểm tra field trống

**Vấn đề**: `lint()` kiểm tra orphan, duplicate, overbook... nhưng không kiểm tra registration thiếu emp_code, full_name, bu.

**Đã sửa**: Thêm check #9 (empty required fields) và check #10 (change_count sanity) trong `lint()`.

**File thay đổi**: `gas/Code.js`

---

### 3.5 ✅ [P1] Không có "Registration Summary Export"

**Vấn đề**: Không có cách nào export nhanh danh sách đăng ký kèm thông tin slot.

**Đã sửa**: Hàm `adminExportSummary()` xuất dạng tab-separated text: `[Email | Mã NV | Họ tên | BU | Speaking display | Skills display]`. Dễ copy vào email hoặc in ra.

**File thay đổi**: `gas/Code.js`

---

### 3.6 ✅ [P1] Không có cách xem registration theo slot

**Vấn đề**: Admin muốn biết "Slot SP-2306-0900 có những ai?" phải filter thủ công.

**Đã sửa**: Hàm `adminSlotDetail(slotId)` trả về danh sách HV đã đăng ký vào 1 slot cụ thể, kèm capacity/booked/remaining.

**File thay đổi**: `gas/Code.js`

---

### 3.7 ⬜ [P2] Không có email hàng loạt (bulk notification)

**Vấn đề**: Khi cần thông báo thay đổi lịch thi cho tất cả HV trong 1 slot, admin phải gửi email thủ công.

**Khuyến nghị**: Hàm `adminNotifySlot(slotId, message)`. Cần cân nhắc quota MailApp (1,500/ngày). Với ~50 HV thì OK.

---

## 4. TỔNG HỢP THAY ĐỔI

| # | Thay đổi | File | Mức độ |
|---|---|---|---|
| 1 | Kill-switch `allow_enrollment` | `gas/Code.js`, `Config.csv` | P0 |
| 2 | Eligibility check | `gas/Code.js`, `Eligibility.csv` | P0 |
| 3 | Confirm dialog khi submit | `src/App.tsx` | P0 |
| 4 | Validation Mã NV/Họ tên/BU (client + server) | `src/App.tsx`, `gas/Code.js` | P1 |
| 5 | Banner timing (6s → 8-10s) | `src/App.tsx` | P0 |
| 6 | Email content nâng cấp (Mã NV, BU, URL, location) | `gas/Code.js` | P1 |
| 7 | Audit log → Sheet `AuditLog` (11 columns) | `gas/Code.js`, `AuditLog.csv` | P1 |
| 8 | Slot location + hiển thị | `gas/Code.js`, `gas.ts`, `App.tsx`, `Slots.csv` | P1 |
| 9 | Slot display: slotId → human-readable | `src/App.tsx` | P0 |
| 10 | `refreshAdminSummary()` (overview + slot + not-registered) | `gas/Code.js` | P0 |
| 11 | Lint: check field trống + change_count sanity | `gas/Code.js` | P1 |
| 12 | Registrations: created_at + change_count columns | `Registrations.csv`, `gas/Code.js` | P1 |
| 13 | Change limit (max_changes) + frontend warnings | `gas/Code.js`, `App.tsx`, `gas.ts` | P1 |
| 14 | `adminExportSummary()` — text export | `gas/Code.js` | P1 |
| 15 | `adminSlotDetail(slotId)` — per-slot query | `gas/Code.js` | P1 |
| 16 | README: cập nhật toàn diện | `README.md` | - |

---

## 5. MỤC CHƯA SỬA (cần quyết định)

| # | Vấn đề | Mức độ | Ghi chú |
|---|---|---|---|
| 1 | Bulk admin operations (bulk cancel 1 slot) | P2 | Ít khi cần với ~50 HV |
| 2 | Mobile UX optimization | P2 | Cần test thực tế trên thiết bị |
| 3 | Progress indicator (step bar) | P2 | Nice-to-have, step numbers đã có |
| 4 | Bulk notification email | P2 | Risk quota, nên dùng Gmail group thay thế |