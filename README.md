# Assessment Booking Q2 2026

React SPA chạy trong Google Apps Script (HtmlService), dùng Google Sheet làm DB. Xác thực email công ty (`@cyberlogitec.com`), chống race bằng `LockService`.

## Cấu trúc

```
.
├── src/                  React app (TypeScript + Vite)
│   ├── lib/gas.ts        cầu nối google.script.run + types
│   ├── lib/mockData.ts   mock dữ liệu cho dev local
│   ├── App.tsx           UI chính
│   ├── main.tsx, styles.css
├── gas/                  Apps Script project (clasp)
│   ├── Code.js           server (init / book / cancel / admin)
│   ├── appsscript.json
│   ├── .claspignore
│   └── index.html        ← copy từ dist/index.html khi deploy
├── sheet-templates/      CSV mẫu để import vào Google Sheet
│   ├── Slots.csv
│   ├── Registrations.csv
│   ├── Config.csv
│   ├── AuditLog.csv
│   └── Eligibility.csv
├── scripts/copy-to-gas.mjs
├── vite.config.ts
└── package.json
```

---

## A. Setup lần đầu

### A.1. Cài Node + clasp

```bash
node -v                              # ≥ 18 (đã có v22)
npm i -g @google/clasp
clasp login                          # đăng nhập tài khoản Workspace
```

Bật Apps Script API: https://script.google.com/home/usersettings → **ON**.

### A.2. Tạo Google Sheet + 5 sheet con

1. Tạo Google Sheet mới (tên: `Assessment Booking Q2 2026`).
2. Tạo **5 sheet con** với đúng tên (case-sensitive):
   - **Slots** — import `sheet-templates/Slots.csv` (File → Import → Upload → Replace current sheet, separator: Comma).
   - **Registrations** — import `sheet-templates/Registrations.csv` (chỉ có header, không có data).
   - **Config** — import `sheet-templates/Config.csv`.
   - **AuditLog** — import `sheet-templates/AuditLog.csv` (chỉ header).
   - **Eligibility** — import `sheet-templates/Eligibility.csv` (chỉ header, điền DS học viên hợp lệ).
3. Trong sheet `Slots`:
   - Chọn cột `date`, format → **Date** (`yyyy-mm-dd` hoặc bất kỳ format Date nào).
   - Chọn cột `start_time` và `end_time`, format → **Time** (`HH:mm`).
   - Cột `location` là text tự do (VD: `Phòng A`, `Building A - Floor 3`).
4. Trong sheet `Config`:
   - Ô `value` của `deadline`: format → **Date time**. Sửa giá trị cho đúng deadline thực tế.
   - Ô `value` của `email_confirm`: gõ `TRUE` hoặc `FALSE`.
   - Ô `value` của `allow_enrollment`: gõ `TRUE` để mở, `FALSE` để khoá.

### A.3. Bind Apps Script vào Sheet

1. Trong Sheet, **Extensions → Apps Script**. Một project mới mở ra.
2. Đặt tên project (VD: `Booking App`).
3. Copy **Script ID** từ Project Settings (icon bánh răng bên trái → Settings → IDs).
4. Trong repo, copy file template:
   ```bash
   cp gas/.clasp.json.example gas/.clasp.json
   ```
5. Mở `gas/.clasp.json`, dán Script ID vào.

### A.4. Đăng ký scope cho user đầu tiên (owner)

Sau khi push lần đầu (mục B), mở Apps Script editor → chạy thử function `init` → chấp thuận các scope:
- Spreadsheet (read/write)
- Email user info
- Send email (nếu bật `email_confirm`)

Mỗi HV lần đầu vào app cũng sẽ thấy màn hình authorize tương tự.

---

## B. Workflow phát triển

### B.1. Dev local (UI)

```bash
npm i
npm run dev
```

Truy cập `http://localhost:5173`. App tự động chạy với **mock data** (lưu state vào `localStorage`). Mock cho phép thử book/cancel để test UI.

> Mock state có thể reset bằng cách xóa key `mock_booking_state_v1` trong DevTools → Application → Local Storage.

### B.2. Build single-file

```bash
npm run build
```

Output: `dist/index.html` (toàn bộ JS + CSS inline trong 1 file).

### B.3. Deploy lên Apps Script

```bash
npm run push       # build + copy → gas/index.html + clasp push
npm run deploy     # như push + clasp deploy (tạo version mới)
```

Sau `npm run deploy` lần đầu, mở Apps Script editor → **Deploy → Manage deployments** để lấy URL `.../exec`. Các lần deploy sau, version sẽ tự tăng nhưng URL không đổi.

### B.4. Cấu hình Web app deployment (chỉ 1 lần)

Trong Apps Script editor → **Deploy → New deployment**:

- **Type**: Web app
- **Execute as**: `User accessing the web app`
- **Who has access**: `Anyone within cyberlogitec.com`

Copy URL `.../exec` — đây là link gửi cho HV.

> Hai setting `Execute as` + `Who has access` cũng đã khai trong `appsscript.json`, nhưng setting trên UI mới là setting áp dụng. Hai cái phải khớp.

---

## C. Vận hành

### C.1. Mở/đóng đăng ký

- **Bằng deadline**: Mở sheet `Config`, sửa ô `deadline`. Sau thời điểm này, server trả `deadlinePassed: true` và mọi `book()` / `cancel()` đều bị từ chối.
- **Bằng khoá khẩn cấp**: `Config` → `allow_enrollment` → `FALSE`. Có hiệu lực ngay, bất kể deadline. Dùng khi cần dừng đăng ký ngay lập tức (VD: sự cố hệ thống, thay đổi lịch thi).

### C.2. Thêm/sửa slot

Mở sheet `Slots`, thêm dòng mới. **Không** sửa `slot_id` của slot đã có HV đăng ký (sẽ orphan record).

Cột `location` hiển thị địa điểm thi cho học viên (VD: `Phòng A`, `Tầng 3 - Toà B`).

### C.3. Sanity check Sheet (`lint`)

Trong Apps Script editor: chọn function `lint` từ dropdown → **Run** → mở **View → Logs**. Lint kiểm tra:

- Duplicate `slot_id`
- Slot có `type` không hợp lệ, `capacity ≤ 0`, hoặc `start_time ≥ end_time`
- Registration trỏ tới `slot_id` không còn tồn tại (orphan sau khi admin xóa slot)
- Registration có `speaking_slot_id` trỏ tới slot 3 Skills (hoặc ngược lại)
- Tổng booked > capacity (overbook do admin sửa tay)
- Cùng email xuất hiện ở >1 dòng (đáng ra chỉ 1)
- 2 ca của 1 HV trùng giờ (sau khi admin sửa sheet)
- Config thiếu `deadline`
- Registration thiếu `emp_code`, `full_name`, hoặc `bu`

Chạy `lint` trước khi mở đăng ký, sau khi import data, hoặc bất kỳ khi nào admin sửa sheet thủ công.

### C.4. Audit log

Mỗi sự kiện `book.create`, `book.update`, `cancel`, `eligibility_block`, `validation_error` được ghi vào 2 nơi:

1. **Sheet `AuditLog`** — xem trực tiếp trong Google Sheet, cột `detail_json` chứa chi tiết.
2. **Console** — xem ở Apps Script editor: **View → Executions → Logs**.

Định dạng cột AuditLog:
| Cột | Mô tả |
|---|---|
| timestamp | ISO 8601 |
| email | HV thực hiện |
| event | `book.create` / `book.update` / `cancel` / `eligibility_block` / `validation_error` |
| emp_code | Mã NV |
| full_name | Họ tên |
| bu | BU |
| speaking_slot_id | Slot Speaking mới |
| skills_slot_id | Slot Skills mới |
| prev_speaking | Slot Speaking cũ (nếu update) |
| prev_skills | Slot Skills cũ (nếu update) |
| detail_json | JSON chi tiết (reason, submitted values, etc.) |

### C.5. Eligibility (quản lý danh sách hợp lệ)

Sheet `Eligibility` chứa danh sách email HV được phép đăng ký. Admin điền email HV trước khi mở registration (mỗi email 1 dòng, cột `email` bắt buộc, `full_name`/`bu`/`emp_code` tuỳ chọn).

Nếu sheet `Eligibility` **có data** → chỉ HV trong danh sách mới đăng ký được. Nếu sheet **trống** → mọi HV `@cyberlogitec.com` đều đăng ký được (fallback cho giai đoạn test).

### C.6. Thống kê nhanh

Trong Apps Script editor: chọn function `adminStats` → **Run** → mở **View → Logs**. Output gồm:

- **Total registered / Total eligible**
- **Registered by BU** (breakdown số HV theo BU)
- **% fill per slot** (mỗi slot đã đầy bao nhiêu %)

Dùng để đánh giá nhanh trước khi đóng registration.

### C.7. Ai chưa đăng ký?

Trong Apps Script editor: chọn function `adminMissing` → **Run** → mở **View → Logs**. Output: danh sách email trong sheet Eligibility mà chưa có trong Registrations. Hữu ích để gửi reminder trước deadline.

### C.8. Tắt/bật email xác nhận

Sheet `Config` → `email_confirm` → `TRUE` / `FALSE`.

> Email được gửi qua `MailApp.sendEmail()`. Vì web app deploy `USER_ACCESSING`, email gửi đi với danh nghĩa **HV** (gửi cho chính họ). Có thể tốn 1 lần authorize scope `script.send_mail` ở lần dùng đầu.

---

## D. Checklist trước khi mở đăng ký

- [ ] Sheet `Slots` đầy đủ slot + location, cột `date` format Date, `start_time`/`end_time` format Time.
- [ ] Sheet `Registrations` chỉ có header (data trống).
- [ ] Sheet `Config` có `deadline` đúng, `email_confirm` đúng, `allow_enrollment` = `TRUE`.
- [ ] Sheet `AuditLog` chỉ có header (data trống).
- [ ] Sheet `Eligibility` đã điền DS HV hợp lệ (hoặc để trống nếu mở cho tất cả).
- [ ] `npm run deploy` thành công, scope đã chấp thuận.
- [ ] Web app deployment: `USER_ACCESSING` + `Anyone within cyberlogitec.com`.
- [ ] Chạy `lint()` → không có lỗi.
- [ ] Chạy `adminStats()` → kiểm tra slot capacity hợp lý.
- [ ] Test 3 cổng (mở 2 tab cùng tài khoản test):
  - [ ] Book bình thường → thành công.
  - [ ] Book 2 ca trùng giờ → bị chặn.
  - [ ] Book 1 ca đã full → bị chặn.
  - [ ] Nếu có eligibility → tài khoản ngoài DS bị chặn.
- [ ] Test 2 tab khác tài khoản cùng book slot cuối → chỉ 1 thành công (kiểm chứng `LockService`).
- [ ] Test cancel → row biến mất khỏi sheet, remaining tăng lại.
- [ ] Test deadline: sửa `deadline` về quá khứ → app từ chối book/cancel.
- [ ] Test `allow_enrollment = FALSE` → app hiển thị "đăng ký bị khoá".

---

## E. Ghi chú giới hạn / cảnh báo

- **Identity**: `Session.getActiveUser().getEmail()` chỉ trả email thật khi HV cùng domain Workspace với owner. Người ngoài `@cyberlogitec.com` không vào được (do `Who has access: domain`).
- **Email scope**: nếu `email_confirm: TRUE`, mỗi HV lần đầu vào app sẽ thấy thêm 1 scope `script.send_mail`. Nếu không muốn, set `FALSE`.
- **Quota**: ~20.000 execute/ngày, 1.500 email/ngày (Workspace). Thừa cho ~200 HV.
- **CSP**: HtmlService chạy trong iframe sandbox. Vite single-file đã inline JS/CSS. Tránh thêm CDN `<script>` từ ngoài.
- **Sheet column order là cố định** (theo template). Đừng đổi thứ tự cột, server đọc theo index.
- **Đổi `slot_id` của slot đã có người book**: Registrations sẽ orphan. Tạo slot mới thay vì sửa.
- **LockService**: chỉ có hiệu lực trong cùng 1 script project. Không chống được 2 user chạy script khác nhau cùng lúc (không phải scenario ở đây).

---

## F. Troubleshooting

| Triệu chứng | Nguyên nhân khả dĩ |
|---|---|
| "Không xác định được email" | HV đăng nhập tài khoản cá nhân thay vì Workspace. Logout → login lại bằng `@cyberlogitec.com`. |
| "Bạn không có trong danh sách eligibility" | Sheet `Eligibility` có data nhưng email HV chưa được thêm. Admin cần thêm email vào sheet. |
| "Đăng ký hiện đang bị khoá" | `Config.allow_enrollment` đang là `FALSE`. Admin cần chuyển sang `TRUE`. |
| Slot không hiện | Sheet `Slots` cột `date`/`start_time` không phải Date/Time → server parse ra 00:00 hoặc lỗi. |
| Book báo "đã hết hạn" nhưng deadline còn | Ô `deadline` parse sai format. Format lại cell thành Date time. |
| Email không gửi | `email_confirm: FALSE` trong Config, hoặc quota MailApp hết. Check `View → Executions` trong Apps Script editor. |
| Đổi React UI mà link cũ chưa cập nhật | Sau `clasp deploy`, deployment cũ vẫn dùng version cũ. Mở **Manage deployments → Edit → Version: New version**. |
| AuditLog trống | Sheet `AuditLog` chưa được tạo hoặc header bị sai. Import lại từ `sheet-templates/AuditLog.csv`. |
| `adminStats` / `adminMissing` báo lỗi | Chưa tạo sheet `Eligibility` hoặc `AuditLog`. Import CSV mẫu. |

---

## G. Admin Setup (Firebase / Firestore)

Hệ thống có 2 mode chạy song song: **GAS** (legacy, dùng Google Sheet) và **Firebase** (mới, dùng Firestore). Phần này hướng dẫn cấu hình cho **Firebase mode**.

### G.1. Cấu hình Admin Emails

Admin được xác định bởi email trong Firestore tại `/config/main`.

Trường `adminEmails` là mảng email strings:

```
/config/main → { adminEmails: ["admin1@company.com", "admin2@company.com"] }
```

Nếu Firestore config không khả dụng, app fallback về danh sách hardcode trong `src/lib/admin.ts`.

> **Lưu ý**: Trong `App.tsx`, `refreshAdminCache()` được gọi và **await** trước `isAdmin()` để đảm bảo luôn lấy config mới nhất từ Firestore, tránh dùng stale data.

### G.2. Bật Eligibility Checking (tuỳ chọn)

Để giới hạn chỉ cho phép user cụ thể được đăng ký:

1. Tạo collection `/eligibility` trong Firestore
2. Thêm document cho mỗi user hợp lệ: doc ID = empCode (6 chữ số), fields: `{ empCode, fullName, bu?, email? }`
3. Set `/config/main.requireEligibility = true`

> ⚠️ **Quan trọng**: Nếu `requireEligibility = true` nhưng **chưa có document nào** trong `/eligibility`, hệ thống sẽ **vẫn cho phép tất cả** user đăng ký (backward-compatible). Khi collection có ít nhất 1 document, chỉ user trong danh sách mới được book.

> **Bảo mật**: Firestore rules cho phép `get` (đọc 1 doc theo empCode) với mọi user đã đăng nhập, nhưng `list` (liệt kê toàn bộ collection) chỉ dành cho admin. Điều này ngăn user scraping danh sách eligibility.

### G.3. Blocklist / Ineligibility (chặn user)

Để chặn user cụ thể không được đăng ký:

1. Tạo collection `/ineligibility` trong Firestore
2. Thêm document: doc ID = empCode (6 chữ số), fields: `{ reason: "lý do chặn" }`
3. Khi user nhập empCode bị chặn, hệ thống hiện banner đỏ và không cho qua Step 2.

Hoặc dùng sheet **"Ineligibility"** trong Google Sheet (cột A = Mã NV, cột B = Lý do) cho GAS mode.

> Firestore rules: `get` (đọc 1 doc) cho mọi user, `list` chỉ cho admin.

### G.4. Set Enrollment Deadline

```
/config/main → {
  deadline: Timestamp,        // thời hạn đăng ký
  allowEnrollment: true/false, // khoá/mở đăng ký
  maxChanges: 3,              // số lần đổi ca tối đa
  emailConfirm: true/false    // gửi email xác nhận
}
```

### G.5. Bulk Import (CSV)

Dùng script có sẵn:
- `scripts/seed-firestore.mjs` — import Slots và Config từ CSV vào Firestore
- Sheet templates trong `sheet-templates/` — tham khảo format CSV

```bash
node scripts/seed-firestore.mjs
```
