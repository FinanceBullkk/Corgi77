# Admin Panel — Redesign Spec

> Bản vá UI/UX cho toàn bộ **Admin Panel**. Thay thế giao diện cũ (tab ngang + bảng trần + JSON thô) bằng shell sidebar + data grid chuẩn enterprise.
> Prototype: `prototype/01-hifi/Admin Panel.html` (mở trực tiếp, click được, không cần build).
> Files: `admin-shell.css` (shell + grid), `admin.css` (controls cấu hình), `admin-data.js` (mock domain), `admin-app.js` (render + tương tác). Dùng chung `tokens.css` + `styles.css`.

---

## 1. Heuristic evaluation — vì sao redesign

| Vấn đề bản cũ | Nguyên tắc Nielsen vi phạm | Cách xử lý |
|---|---|---|
| Nút **"Xoá" đỏ ở mọi hàng** (Ca thi, Đăng ký, Chặn) | Error prevention | Gom vào menu `⋯` (hiện khi hover), hành động phá huỷ tách khỏi luồng chính, đặt cuối menu + ngăn cách |
| **Audit đổ JSON thô** (`{"prevSpeakingSlotId":...}`) | Match system & real world | Dịch thành câu người đọc: *"Sửa đăng ký · Speaking: 23/06 15:00 → 10:30"* |
| **Cột rỗng "—"** (Địa điểm, Email, Họ tên) | Aesthetic & minimalist | Điền phòng thật; gộp email/tên vào 1 ô identity; bỏ cột vô nghĩa |
| **"Đã đặt / Sức chứa"** là 2 cột số trần | Recognition over recall | 1 **thanh capacity** (% lấp đầy) + nhãn `booked/cap` |
| Không có trạng thái ca rõ ràng | Visibility of system status | Pill: Còn chỗ / Sắp đầy / Đã đầy / Đã đóng |
| **Tab ngang 6 mục + badge** chật | — | **Sidebar trái** cố định, gom điều hướng |
| **Tổng quan** lặp y hệt bảng Ca thi | — | 4 stat card + "Lấp đầy theo ngày", bỏ bảng lặp |
| **Ca thi: không sửa được ngày/giờ** | User control | Drawer Sửa/Thêm ca: loại · ngày · giờ bắt đầu/kết thúc · phòng · sức chứa |

---

## 2. Information architecture mới

```
Sidebar (dark navy, sticky)
├── Tổng quan        — dashboard: stat cards + fill theo ngày
├── Đăng ký   (n)    — data grid bookings + export CSV + bulk
├── Ca thi    (n)    — data grid slots + capacity + filters + bulk + drawer CRUD
├── Danh sách chặn (n) — block list theo empCode, lý do song ngữ
├── Cấu hình         — settings (toggle/stepper/deadline) — đã spec riêng
├── Audit            — log người đọc được + filter theo loại
└── (foot) ← Về trang User · admin identity
```

Mỗi trang: `main-hd` sticky (tiêu đề + mô tả + 1 action chính phải) → `content` (max-width 1180px).

---

## 3. Component & CSS map (lift trực tiếp)

| Vùng | Class chính (trong `admin-shell.css`) |
|---|---|
| Shell | `.admin-shell` · `.sidebar` · `.nav-item(.active)` · `.main` · `.main-hd` · `.content` |
| Stat | `.statbar` · `.stat` (`.k/.v/.ctx` + `.mini-bar/.mini-fill`) |
| Panel | `.panel` · `.panel-hd` · `.toolbar` (`.search/.select/.filter-chips`) |
| Grid | `.dgrid` (thead/tbody) · `.cbx` · `.id-cell` · `.typ.sp/.sk` · `.stat-pill.ok/warn/full/closed` · `.cap/.cap-track/.cap-fill` |
| Hành động | `.row-acts` · `.icon-act` · `.rowmenu-wrap/.rowmenu` · `.bulkbar` |
| Audit | `.aud-row` · `.aud-ev.create/update/cancel/block` · `.aud-diff` (`.from/.arrow/.to`) |
| Drawer | `.drawer-back` · `.drawer` · `.drawer-hd/bd/ft` (CRUD slot/booking/block) |
| Reason | `.reason` (`.vn` đậm / `.en` nhạt) |

---

## 4. Quy tắc trạng thái ca (production cần implement)

```js
remaining = cap - booked
status =
  !registrationOpen        → 'closed'   // từ Cấu hình "Cho phép đăng ký"
  remaining <= 0           → 'full'
  remaining / cap <= 0.25  → 'warn'     // sắp đầy
  else                     → 'ok'
```
Màu fill capacity: ok = brand-500 (Speaking) / accent-500 (3 Skills) · warn = warn-500 · full = danger-500.

---

## 5. Dịch Audit từ event thô → câu người đọc

Backend trả event log dạng `{ event, actor, createdAt, payload }`. Frontend dịch:

| `event` | Nhãn hiển thị | Diff dựng từ payload |
|---|---|---|
| `book.create` | Tạo đăng ký | Speaking: → `speakingSlotId` · 3 Skills: → `skillsSlotId` |
| `book.update` | Sửa đăng ký | Speaking: `prevSpeakingSlotId` → `speakingSlotId` (tương tự 3 Skills) · meta = `Lần đổi #changeCount` |
| `book.cancel` | Huỷ đăng ký | note: "Huỷ toàn bộ đăng ký" |
| `admin.upsertIneligibility` | Thêm vào danh sách chặn | note = `reason` |

**Slot ID → nhãn**: format `SP-DDMM-HHMM` / `3S-DDMM-HHMM`. Hàm `aSlotLabel()` (trong `admin-data.js`) tra slot hiện có, fallback parse ID → `DD/MM · HH:MM`. Port nguyên hàm này.

---

## 6. Tương tác đã prototype

- **Chọn hàng** (checkbox) → `.bulkbar` trượt vào đầu panel: Ca thi = Đóng đăng ký / Xoá · Đăng ký = Xuất CSV / Huỷ. "Chọn tất cả" ở header tôn trọng bộ lọc đang áp.
- **Row menu `⋯`**: Ca thi = Sửa / Nhân bản / Đóng đăng ký / Xoá · Đăng ký = Xem / Đổi ca giùm / Gửi lại email / Huỷ · Chặn = Sửa lý do / Gỡ chặn.
- **Drawer Sửa/Thêm ca** (`openDrawer('slot', id)`): đổi loại ca auto-set thời lượng (sp 60′ / sk 150′); đổi giờ bắt đầu (khi tạo mới) auto-tính giờ kết thúc; validate ngày/giờ + giờ kết thúc > bắt đầu; cảnh báo nếu slot đang có đăng ký. Lưu → cập nhật grid.
- **Search**: lọc client-side theo `data-search` của hàng (production: query server có debounce).
- **Filter**: chips loại ca + select ngày (Ca thi), select BU (Đăng ký), chips loại event (Audit).

---

## 7. Lưu ý khi port production

1. **Mock data** trong `admin-data.js` (`A_SLOTS`, `A_BOOKINGS`, `A_BLOCKS`, `A_AUDIT`) chỉ minh hoạ — production lấy từ API. Số lượng booking trong mock (~12) là để demo grid, thực tế đầu kỳ ít hơn.
2. **Capacity**: Speaking = 8, 3 Skills = 14 (theo data thật). Backend nên trả `booked` đã tính sẵn để khỏi count client.
3. **Bulk / row actions** hiện chỉ toast — production wire vào API tương ứng (đều phải ghi Audit với tài khoản admin).
4. **Đổi ngày/giờ slot đang có đăng ký**: cần quyết định nghiệp vụ — có gửi email báo thí sinh không? (mục Open question, hỏi BTC).
5. **Cấu hình** dùng lại spec controls (toggle/stepper/deadline/admin emails) — xem nhánh `viewConfig()` trong `admin-app.js`.
6. **Audit immutable** — chỉ đọc, không sửa/xoá, giữ tối đa theo retention policy (§10 plan).

---

## 8. Files trong package

| File | Vai trò |
|---|---|
| `Admin Panel.html` | Shell, load toàn bộ — entry point |
| `admin-shell.css` | Sidebar + data grid + stat + toolbar + pill + capacity + bulk + audit + drawer |
| `admin.css` | Controls tab Cấu hình (toggle switch, stepper, setting-row, save bar) |
| `admin-data.js` | Mock domain + helpers (`aSlotLabel`, `aSlotStatus`, `aTotals`…) |
| `admin-app.js` | Render mỗi tab + tương tác (vanilla JS, event delegation) |
