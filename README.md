# Assessment Booking Q2 2026

React + Firebase booking app cho kỳ Assessment Q2 2026.

Production hiện tại chạy trên:

- **Firebase Hosting**: serve React SPA build bằng Vite.
- **Firebase Authentication**: đăng nhập Google.
- **Cloud Firestore**: lưu slots, registrations, config, eligibility/blocklist, audit logs.
- **Cloud Functions v2**: xử lý booking/cancel bằng transaction server-side.
- **Firestore Rules**: chặn truy cập ngoài quyền và bảo vệ các write client-side còn lại.

> Google Apps Script / Google Sheet là hướng triển khai legacy trong các handoff cũ. README này mô tả Firebase app hiện tại.

## Cấu Trúc

```text
.
├── src/                         React app
│   ├── App.tsx                  Booking flow
│   ├── AdminPanel.tsx           Admin lazy-loaded panel
│   ├── booking/                 Booking UI components
│   ├── admin/                   Admin tabs and controls
│   ├── lib/db.ts                User-facing Firestore/Functions API
│   ├── lib/adminDb.ts           Admin Firestore API
│   └── __tests__/               Vitest suites
├── functions/
│   ├── index.js                 Cloud Functions callables and scheduled repair
│   └── package.json
├── firestore.rules              Firestore security rules
├── firebase.json                Firebase Hosting/Firestore/Functions config
├── .github/workflows/deploy.yml CI verify + Hosting deploy
├── package.json
└── vite.config.ts
```

## Luồng Chính

### User Booking

1. User đăng nhập Google.
2. App load `/config/main`, `/slots`, và đăng ký hiện tại tại `/registrations/{email}`.
3. Ở bước nhập thông tin, app pre-flight `empCode` bằng:
   - `/ineligibility/{empCode}`
   - `/eligibility/{empCode}` nếu `requireEligibility = true`
   - `/empCodeClaims/{empCode}` để báo sớm nếu mã NV đã đăng ký bằng email khác
4. Khi submit, client gọi Cloud Function `bookRegistration`.
5. Function chạy Firestore transaction để:
   - kiểm tra config/deadline/blocklist/eligibility
   - giữ lock `/empCodeClaims/{empCode}`
   - kiểm tra slot hợp lệ, không trùng giờ, còn chỗ
   - cập nhật `/registrations/{email}`
   - giảm/tăng `remaining` của slot khi tạo/đổi ca
6. Function ghi audit log và queue email xác nhận nếu config bật.

### Cancel

Client gọi Cloud Function `cancelRegistration`. Function transactionally xoá registration, trả ghế về slot, xoá claim `empCode`, lưu quota đổi ca và ghi audit.

### Emp Code Uniqueness

Không dùng `registrations/{empCode}` vì app cần tra booking theo email đăng nhập. Thay vào đó dùng collection lock:

```text
/empCodeClaims/{empCode} -> { email }
```

`bookRegistration` đọc claim trong transaction. Nếu claim tồn tại với email khác, request bị chặn bằng thông báo `Mã NV này đã đăng ký bằng email khác.`. `cancelRegistration` xoá claim của email hiện tại để giải phóng mã NV.

## Firestore Data Model

```text
/config/main
  allowEnrollment: boolean
  deadline: Timestamp
  maxChanges: number
  emailConfirm: boolean
  requireEligibility: boolean
  adminEmails: string[]

/slots/{slotId}
  type: "Speaking" | "3 Skills"
  date: "YYYY-MM-DD"
  session: string
  startMin: number
  endMin: number
  capacity: number
  remaining: number
  location: string

/registrations/{email}
  email: string
  empCode: string
  fullName: string
  bu: string
  speakingSlotId: string
  skillsSlotId: string
  createdAt: Timestamp
  updatedAt: Timestamp
  changeCount: number

/empCodeClaims/{empCode}
  email: string

/eligibility/{empCode}
  empCode: string
  fullName?: string
  bu?: string
  email?: string

/ineligibility/{empCode}
  reason: string
  email?: string
  fullName?: string

/auditLogs/{autoId}
  timestamp: Timestamp
  email: string
  event: string
  detail: object

/mail/{autoId}
  to: string
  message: { subject: string, html: string }
```

## Setup Local

### 1. Cài dependencies

```bash
npm ci
cd functions && npm ci
```

### 2. Tạo `.env.local`

Copy từ `.env.example` rồi điền Firebase web app config:

```bash
cp .env.example .env.local
```

Các biến cần có:

```text
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

### 3. Chạy dev server

```bash
npm run dev
```

Mặc định Vite chạy ở `http://localhost:5173`.

## Scripts

```bash
npm run dev              # local Vite dev server
npm run typecheck        # TypeScript check
npm test -- --run        # Vitest
npm run test:rules       # Firestore rules emulator tests (cần Java)
npm run check:functions  # syntax check functions/index.js
npm run check:rules      # Firebase dry-run compile firestore.rules
npm run build            # production build
npm run check            # typecheck + test + functions syntax + build
```

`test:rules` chạy Firestore emulator nên cần Java runtime. `check:rules` cần Firebase CLI login/service account vì nó gọi API compile rules của Firebase.

## Deploy

### Hosting

```bash
npm run build
firebase deploy --only hosting
```

### Firestore Rules

```bash
firebase deploy --only firestore:rules
```

### Cloud Functions

```bash
firebase deploy --only functions
```

Functions hiện tại:

- `bookRegistration`
- `cancelRegistration`
- `repairEmpCodeClaimsNow`
- `scheduledRepairEmpCodeClaims`

Nếu chỉ đổi UI, deploy Hosting là đủ. Nếu đổi `functions/index.js`, phải deploy Functions. Nếu đổi `firestore.rules`, phải deploy rules.

## CI

`.github/workflows/deploy.yml` chạy:

- `npm run typecheck`
- `npm test -- --run`
- `npm run test:rules`
- `npm run check:functions`
- `npm run check:rules`
- `npm run build`

Pull request vào `main` chỉ verify. Push vào `main` verify xong mới deploy Firebase Hosting.

CI cần secret:

- `FIREBASE_SERVICE_ACCOUNT`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

## Admin Operation

### Config

Admin chỉnh `/config/main` qua Admin Panel:

- `allowEnrollment`: mở/khoá đăng ký
- `deadline`: hạn đăng ký
- `maxChanges`: số lần đổi ca tối đa
- `emailConfirm`: queue email xác nhận
- `requireEligibility`: bắt buộc mã NV có trong `/eligibility`
- `adminEmails`: danh sách admin động

### Slots

Admin tạo/sửa/xoá slot trong Admin Panel. Mỗi slot có `type`, `date`, `session`, `startMin`, `endMin`, `capacity`, `remaining`, `location`.

Lưu ý: hệ thống không cho xoá slot đang có registration. Hãy huỷ hoặc chuyển các đăng ký liên quan trước khi xoá slot production.

### Registrations

Registrations được lưu theo email: `/registrations/{email}`. Admin Panel load registrations theo trang để tránh full-scan lớn.

### Eligibility / Ineligibility

- `/eligibility/{empCode}`: danh sách mã NV được phép đăng ký khi `requireEligibility = true`.
- `/ineligibility/{empCode}`: blocklist. Reason sẽ hiển thị cho user ở bước nhập thông tin.

### Emp Code Claims Repair

`repairEmpCodeClaimsNow` và `scheduledRepairEmpCodeClaims` dùng để backfill/sửa `/empCodeClaims` từ registrations hiện có. Duplicate empCode sẽ bị report trong kết quả repair và cần admin xử lý dữ liệu gốc.

## Checklist Trước Khi Mở Đăng Ký

- [ ] `/config/main.allowEnrollment = true`
- [ ] `/config/main.deadline` đúng thời hạn
- [ ] Slots đã đủ capacity/location
- [ ] Eligibility đã import nếu bật `requireEligibility`
- [ ] Ineligibility đã import nếu có blocklist
- [ ] Không còn duplicate `empCode` trong registrations cũ
- [ ] `repairEmpCodeClaimsNow` đã chạy/backfill claim cho data cũ
- [ ] Test user book 2 ca hợp lệ thành công
- [ ] Test mã NV trùng email khác bị chặn ngay ở bước nhập thông tin
- [ ] Test 2 ca trùng giờ bị chặn
- [ ] Test slot full bị chặn
- [ ] Test cancel trả ghế và giải phóng empCode claim
- [ ] `npm run check` pass
- [ ] `npm run check:rules` pass

## Troubleshooting

| Triệu chứng | Kiểm tra |
|---|---|
| `missing or insufficient permissions` khi admin thao tác | Email có nằm trong `/config/main.adminEmails` không; rules/functions đã deploy chưa |
| User nhập mã NV trùng nhưng chưa bị chặn | `/empCodeClaims/{empCode}` đã được backfill chưa; rules/functions mới đã deploy chưa |
| Booking báo lỗi nhưng Firestore đã đổi data | Kiểm tra Cloud Functions logs; audit log fail đã được catch, nhưng email queue hoặc lỗi post-commit khác cần xem logs |
| Slot còn chỗ sai | Kiểm tra registrations trỏ tới slot, `remaining`, và chạy repair/admin đối soát |
| Firestore rules warnings khi deploy | Firebase linter có thể warning helper functions/get/exists nhưng deploy pass nếu `compiled successfully` |
| Functions deploy lỗi Eventarc/IAM | Re-run sau vài phút hoặc cấp role theo Firebase CLI gợi ý; scheduled functions cần Cloud Scheduler/PubSub/Eventarc setup |

## Legacy Notes

Các thư mục/tài liệu cũ về Google Apps Script, Google Sheet, `clasp`, hoặc sheet templates chỉ còn giá trị tham khảo/handoff lịch sử. Luồng production hiện tại là Firebase-first như mô tả ở trên.
