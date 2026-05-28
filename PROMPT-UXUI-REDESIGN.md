# Prompt: Corgi7 — UX/UI Review & Redesign Brief

> Gửi file này cho team UX/UI. Họ có thể dùng AI (Cline, ChatGPT, v.v.) kèm file này để phân tích và đề xuất thiết kế mới.

---

## 1. Project Overview

**Corgi7** là hệ thống đăng ký ca thi Assessment cho nhân viên công ty (CyberLogitec). Người dùng đăng nhập bằng Google (email công ty `@cyberlogitec.com`), điền thông tin cá nhân, chọn 2 ca thi (Speaking + 3 Skills), và xác nhận đăng ký.

**Tech stack:** React + TypeScript + Firebase (Firestore + Auth). Deployment trên Firebase Hosting.

**Đối tượng người dùng:**
- **Người dùng chính (~95%):** Nhân viên công ty cần đăng ký ca thi Assessment
- **Admin (~5%):** Quản lý slots, config, xem registrations, audit log

---

## 2. Current Screens & User Flow

### 2.1 — Luồng Người dùng (User Flow)

```
[Sign In] → [Blocked Screen] (nếu sai domain)
    ↓ (đúng domain)
[Loading]
    ↓
[App Inner] ──── đã có booking ──→ [Booking Display] → [Edit] → [Booking Form]
    │                                                            ↓
    └── chưa có booking ──→ [Booking Form Step 1] → [Step 2] → [Confirm]
```

### 2.2 — Danh sách Screens hiện tại

#### Screen 1: Loading
- Spinner + text "Đang tải…"
- Hiển thị khi app đang khởi tạo

#### Screen 2: Sign In (`SignInScreen`)
- Tiêu đề: "Đăng ký thi Assessment Q2 2026"
- Subtitle: "Đăng nhập bằng tài khoản Google để tiếp tục"
- 1 nút: "🔑 Đăng nhập bằng Google"
- Error message nếu đăng nhập thất bại

#### Screen 3: Blocked Screen (`BlockedScreen`)
- Hiển thị khi user đăng nhập bằng email không thuộc domain `@cyberlogitec.com`
- Thông báo: "Tài khoản không hợp lệ"
- Hiển thị email đang dùng
- Nút "Đăng xuất"

#### Screen 4: Header (`Header`)
- Trái: Tiêu đề + email user
- Phải: Deadline pill + nút Admin (nếu là admin) + nút Đăng xuất

#### Screen 5: Deadline Pill (`DeadlinePill`)
- Hiển thị countdown: "Hạn đăng ký: còn X ngày Y giờ"
- Warning (vàng): khi còn < 2 ngày
- Urgent/Passed (đỏ): khi còn < 1 giờ hoặc đã hết hạn
- Cập nhật mỗi 30 giây

#### Screen 6: Booking Form — Step 1: Thông tin học viên
- Step indicator: 1 (active) → 2
- Form fields:
  - Mã NV (6 chữ số, numeric only)
  - Họ và tên
  - BU (Business Unit)
- Validation realtime: Mã NV phải đúng 6 số, tên >= 2 ký tự
- Nút: "Tiếp tục →"

#### Screen 7: Booking Form — Step 2: Chọn ca thi
- Step indicator: 1 (done) → 2 (active)
- Profile summary card (tên, mã NV, BU + nút "← Sửa thông tin")
- Section "Chọn ca Speaking": Grid radio cards
- Section "Chọn ca 3 Skills": Grid radio cards (disabled nếu chưa chọn Speaking)
- Mỗi slot card hiển thị: ngày + giờ, địa điểm, số chỗ còn lại
- Conflict detection: nếu trùng giờ với ca Speaking → disable + ghi "Trùng giờ"
- Nút: "Đăng ký" / "Cập nhật đăng ký"

#### Screen 8: Booking Display (`BookingDisplay`)
- Hiển thị booking đã đăng ký dưới dạng definition list (dl/dt/dd)
- Thông tin: Mã NV, Họ tên, BU, Ca Speaking, Ca 3 Skills, thời gian đăng ký/cập nhật
- Đếm số lần đổi: "Đã đổi ca: X / Y lần"
- Nút: "Đổi ca" + "Hủy đăng ký"

#### Screen 9: Banner (Toast)
- Success (xanh lá): "Đăng ký thành công!" / "Đã hủy đăng ký."
- Error (đỏ): thông báo lỗi
- Auto-dismiss: 10s (success), 8s (error)

#### Screen 10: Error Screen
- Hiển thị khi dữ liệu load thất bại
- Nút "Tải lại"

---

### 2.3 — Luồng Admin

```
[Header] → nút "🛠 Admin"
    ↓
[Admin Panel] ─── Tab: Ca thi ─── [Slots Table] → [Add Slot Form] → [Delete Slot]
    │              Tab: Đăng ký ── [Registrations Table] → [Delete Registration]
    │              Tab: Chưa đăng ký ── [Not Registered List]
    │              Tab: Cấu hình ── [Config Toggles]
    │              Tab: Nhật ký ── [Audit Log Table]
    └── nút "← Quay lại"
```

#### Admin Tab 1: Ca thi (Slots)
- Stats grid: tổng số slots, tổng capacity, tổng remaining
- Table: Type | Date | Session | Time | Location | Capacity | Remaining | Actions
- Expandable row: click vào slot → hiện danh sách người đã đăng ký (email, mã NV, họ tên, BU)
- "+ Thêm ca" button → form thêm slot mới (type, date, session, startMin, endMin, capacity, location)
- Nút xóa per slot (confirm dialog, cảnh báo nếu có booking)

#### Admin Tab 2: Đăng ký (Registrations)
- Table: Email | Mã NV | Họ tên | BU | Speaking Slot | Skills Slot | Registered At
- Nút xóa per registration

#### Admin Tab 3: Chưa đăng ký (Not Registered)
- Danh sách người trong eligibility list nhưng chưa đăng ký
- Table: Email | Mã NV | Họ tên | BU
- Empty state nếu không có eligibility data

#### Admin Tab 4: Cấu hình (Config)
- Toggle: Cho phép đăng ký (allowEnrollment)
- Toggle: Yêu cầu eligibility check (requireEligibility)
- Toggle: Gửi email xác nhận (emailConfirm)
- Input: Số lần đổi tối đa (maxChanges)
- DateTime picker: Hạn đăng ký (deadline)

#### Admin Tab 5: Nhật ký (Audit Log)
- Table: Timestamp | Email | Event | Detail
- Hiển thị 50 entries gần nhất

---

## 3. Current Design System

### Colors (CSS Variables)
```css
--bg: #f5f7fb           /* Page background */
--card: #ffffff          /* Card background */
--border: #e2e8f0        /* Light border */
--border-strong: #cbd5e1 /* Input borders */
--primary: #2563eb       /* Blue — primary actions */
--danger: #dc2626        /* Red — destructive actions */
--success: #059669       /* Green — success states */
--warning: #d97706       /* Orange — warnings */
--text: #0f172a          /* Main text */
--text-muted: #64748b    /* Secondary text */
```

### Typography
- Font: System font stack (SF Pro, Segoe UI, Roboto)
- Base size: 15px
- Heading: 22px (h1), 16px (h2)
- Body: 14-15px
- Small/label: 12-13px

### Layout
- Max width: 880px, centered
- Mobile breakpoint: 600px
- Cards: 12px border-radius, 20px padding
- Grid: auto-fill with minmax for responsive

### Components
- Buttons: primary (blue), danger (red), ghost (outlined)
- Cards: white bg, border, rounded
- Slot cards: radio-style selectable cards
- Tables: sticky header, hover row highlight
- Banners: top notification bar
- Step indicator: numbered dots with connecting line

---

## 4. Known UX/UI Pain Points

### 4.1 — Booking Flow

| # | Pain Point | Severity |
|---|-----------|----------|
| A1 | **Slot cards có quá ít thông tin** — chỉ hiện ngày/giờ/địa điểm/số chỗ. Không có visual distinction giữa các loại slot, không có color coding cho availability | Medium |
| A2 | **Conflict detection quá đơn giản** — chỉ disable slot trùng giờ + ghi "Trùng giờ". Không giải thích tại sao, không highlight slot bị conflict | Low |
| A3 | **Confirm dialog quá dài** — `window.confirm()` với text dài khó đọc. Không có visual preview | Medium |
| A4 | **Không có progress saving** — nếu user reload giữa chừng (step 2), mất hết dữ liệu step 1 | Medium |
| A5 | **Step 2 quá dài nếu nhiều slots** — grid hiển thị tất cả slots cùng lúc, không filter/sort/group theo ngày | High |
| A6 | **Không có search/filter cho slots** — user phải scroll qua toàn bộ slots để tìm ca phù hợp | High |
| A7 | **Deadline pill cập nhật mỗi 30s nhưng không có notification khi sắp hết hạn** | Low |

### 4.2 — Booking Display

| # | Pain Point | Severity |
|---|-----------|----------|
| B1 | **Definition list (dl/dt/dd) không trực quan** — khó scan nhanh | Medium |
| B2 | **Nút "Đổi ca" và "Hủy đăng ký" nằm cạnh nhau** — dễ nhấn nhầm | Medium |
| B3 | **Không có visual confirmation booking thành công** — chỉ có banner toast nhỏ ở trên | Medium |

### 4.3 — Admin Panel

| # | Pain Point | Severity |
|---|-----------|----------|
| C1 | **Admin panel chiếm toàn bộ màn hình** — mất context, không có breadcrumb/navigation | Medium |
| C2 | **Bảng registrations không có pagination** — load hết cùng lúc, chậm nếu >100 registrations | High |
| C3 | **Không có export CSV** — admin cần export data để báo cáo | Medium |
| C4 | **Config page dùng native toggle/input** — không consistent với design system | Low |
| C5 | **Audit log không có filter/search** — khó tìm event cụ thể | Medium |
| C6 | **Add Slot form quá dài** — 7 fields trên 1 form, không có grouping | Low |

### 4.4 — General

| # | Pain Point | Severity |
|---|-----------|----------|
| D1 | **Không có dark mode** | Low |
| D2 | **Không có responsive testing** — mobile breakpoint chỉ ở 600px, tablet chưa được test | Medium |
| D3 | **Accessibility chưa được audit** — contrast ratio, keyboard navigation, screen reader | High |
| D4 | **Không có loading skeleton** — chỉ có spinner đơn giản | Low |
| D5 | **Error states quá generic** — không có illustration, không có suggestion để fix | Low |

---

## 5. Redesign Requests

### 5.1 — Priority 1: Booking Flow Redesign

**Mục tiêu:** Giảm thời gian đặt booking từ 3-5 phút xuống 1-2 phút.

Cần thiết kế lại:

1. **Slot Selection UX:**
   - Group slots theo ngày (collapsible sections hoặc tabs theo ngày)
   - Color code cho availability: xanh (còn nhiều), vàng (sắp hết), đỏ (hết chỗ)
   - Filter/search: cho phép filter theo ngày, session, giờ
   - Visual indicator cho slot đang chọn vs slot hiện tại (khi đổi ca)
   - Hiển thị "recommended" slots (slots có nhiều chỗ trống nhất)

2. **Conflict Prevention:**
   - Khi chọn ca Speaking, tự động highlight ca Skills bị trùng giờ (không chỉ disable)
   - Tooltip giải thích "Ca này trùng giờ với ca Speaking bạn đã chọn"
   - Có thể auto-scroll xuống phần Skills sau khi chọn Speaking

3. **Booking Confirmation:**
   - Thay `window.confirm()` bằng modal/overlay đẹp
   - Hiển thị summary card với tất cả thông tin trước khi confirm
   - Có animation khi booking thành công (confetti, checkmark animation, v.v.)

4. **Step Indicator Improvement:**
   - Dạng breadcrumb thay vì dots — có thể click để quay lại step 1
   - Hiển thị tên step rõ ràng hơn

### 5.2 — Priority 2: Booking Confirmation & Success State

**Mục tiêu:** Tạo cảm giác "thành công" rõ ràng, giảm anxiety.

1. **Success Screen:**
   - Thay banner toast bằng dedicated success view
   - Large checkmark animation
   - Summary card với tất cả thông tin booking
   - Nút "Chia sẻ" hoặc "Tải PDF xác nhận"
   - Countdown timer đến hạn thi

2. **Booking Display Redesign:**
   - Card-based layout thay vì definition list
   - Visual timeline cho ngày thi
   - Quick action buttons với confirmation modal riêng

### 5.3 — Priority 3: Admin Panel UX

**Mục tiêu:** Admin có thể hoàn thành công việc trong 30 giây thay vì 2 phút.

1. **Dashboard Layout:**
   - Sidebar navigation thay vì tabs trên cùng
   - Breadcrumb navigation
   - Quick stats cards ở trên cùng (tổng đăng ký, slots còn trống, v.v.)

2. **Data Table Improvements:**
   - Pagination (50 rows/page)
   - Column sorting
   - Search/filter bar
   - Export CSV button
   - Bulk actions (select + delete)

3. **Slot Management:**
   - Drag-and-drop để reorder slots
   - Bulk import từ CSV
   - Visual calendar view cho slots

### 5.4 — Priority 4: Mobile & Accessibility

1. **Mobile Optimization:**
   - Bottom sheet cho slot selection
   - Swipe gestures
   - Larger touch targets (min 44px)
   - Bottom navigation bar

2. **Accessibility:**
   - WCAG 2.1 AA compliance
   - Keyboard navigation cho toàn bộ flow
   - Screen reader support
   - Focus management
   - High contrast mode

---

## 6. Design Deliverables Expected

### Phase 1: Wireframes (Low-fidelity)
- User booking flow (tất cả screens)
- Admin panel (tất cả tabs)
- Mobile versions

### Phase 2: High-fidelity Mockups
- Desktop + Mobile cho mỗi screen
- Component library (buttons, cards, tables, forms, modals)
- Color palette & typography updates (nếu cần)
- Dark mode variant (optional)

### Phase 3: Interactive Prototype
- Clickable prototype trên Figma/Adobe XD
- User flow từ sign-in đến booking confirmation
- Admin flow từ login đến export data

### Phase 4: Design Specifications
- Spacing, sizing, color specs
- Responsive breakpoints
- Animation/transition specs
- Component states (default, hover, active, disabled, error, loading)

---

## 7. Reference Files

Team UX/UI có thể đọc các file sau để hiểu rõ hơn:

| File | Nội dung |
|------|----------|
| `src/App.tsx` | Toàn bộ user-facing UI components (602 dòng) |
| `src/AdminPanel.tsx` | Admin dashboard (918 dòng) |
| `src/styles.css` | CSS hiện tại — design tokens, layout, components (546 dòng) |
| `src/lib/gas.ts` | Data types (Slot, Booking, Config interfaces) |
| `index.html` | Entry point, meta tags |
| `README.md` | Project overview và setup |

---

## 8. Constraints & Considerations

1. **Tech stack giữ nguyên:** React + TypeScript + CSS (không dùng UI framework như MUI/Ant Design)
2. **CSS-in-JS hoặc Tailwind không được dùng** — chỉ CSS thuần trong `src/styles.css`
3. **Firebase Auth** — login flow không thay đổi
4. **Slot selection logic** phải giữ nguyên (chọn 1 Speaking + 1 Skills, conflict detection)
5. **Deadline system** phải giữ nguyên (countdown pill, server-side validation)
6. **Admin features** phải giữ nguyên tất cả tabs hiện tại, chỉ redesign UX
7. **Accessibility** là bắt buộc (WCAG 2.1 AA)
8. **Performance** — không thêm dependencies lớn (bundle size hiện tại rất nhẹ)

---

## 9. Questions for UX/UI Team

1. Bạn có muốn thiết kế lại hoàn toàn hay chỉ cải thiện UX trên layout hiện tại?
2. Có cần thêm screen nào mới không? (ví dụ: booking history, notification center, profile page)
3. Admin panel nên là modal overlay hay dedicated page?
4. Có cần support đa ngôn ngữ (i18n) không? (Hiện tại chỉ tiếng Việt)
5. Có brand guidelines hoặc logo cần tuân thủ không?
6. Timeline dự kiến cho deliverables?

---

## 10. How to Use This File with AI

Nếu team UX/UI muốn dùng AI để phân tích thêm, copy toàn bộ nội dung file này và paste vào AI session kèm prompt:

> "Phân tích file UX brief này và đề xuất chi tiết cho từng section. Đưa ra wireframe suggestions (ASCII art hoặc mô tả layout) cho mỗi screen. Đề xuất design tokens mới nếu cần."

Hoặc nếu muốn AI generate code:

> "Dựa vào UX brief này, tạo lại component [tên component] với layout mới. Giữ nguyên logic business, chỉ thay đổi UI/UX."