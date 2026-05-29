# Assessment Booking — Implementation Plan

> **Project**: CyberLogitec Assessment Booking (Q2 2026 English Proficiency Test)
> **Owner**: Engineering — 2–3 devs · 8–12 tuần
> **Source of truth (design)**: `design_handoff_booking_flow/01-hifi/Booking Flow Hi-fi.html`
> **Status**: Plan v1 — draft cho dev review

---

## 0. TL;DR

Sản phẩm là một internal web app cho nhân viên CyberLogitec đăng ký 2 ca thi (1 Speaking 60′ + 1 3-Skills 120′) trong một tuần thi cố định. Đặc tính chính:

- **Auth domain-restricted** — chỉ `@cyberlogitec.com` đăng nhập qua Google OAuth.
- **Booking 2 slots phải không trùng giờ** — UI block tự khóa conflict.
- **Capacity-aware** — slot có sức chứa cố định, race condition khi nhiều người chọn cùng lúc → cần **DB-level locking**.
- **Đổi ca tối đa 3 lần** — quota lưu trên server, không phải client.
- **Deadline cứng** — sau hạn, mọi booking/edit endpoint trả 403.

Plan này cover: tech stack & rationale, kiến trúc, data model + API contract, component breakdown, routing, state management, validation, edge cases, milestone chia ticket cho 2–3 devs.

---

## 1. Tech Stack

| Layer | Choice | Lý do |
|---|---|---|
| **Frontend framework** | **Next.js 14 (App Router) + TypeScript** | Kế thừa React đã dùng trong prototype, SSR cho SEO/perf không quan trọng nhưng route handlers tích hợp BE → ít boilerplate cho team 2–3 người |
| **Styling** | **CSS Modules** + giữ nguyên `tokens.css` từ design system | Prototype đã có token system (`--brand-*`, `--ink-*`, `--r-*`, `--sh-*`). Migrate trực tiếp, không cần Tailwind |
| **UI components** | Tự build (port từ prototype) | Component pool nhỏ (~15 component). Library bên ngoài (MUI/AntD) sẽ phá design system |
| **Forms** | **React Hook Form** + **Zod** resolver | Validation rules ở Step 1 phức tạp vừa (regex empCode, length BU), Zod schema dùng chung FE/BE |
| **Server state** | **TanStack Query (React Query) v5** | Slot availability cần polling/invalidate sau khi book. Caching giảm load BE |
| **Client state** | **React Context** + `useReducer` | App state nhỏ (route, draft selection). Zustand là overkill |
| **Auth** | **NextAuth.js (Auth.js v5)** + Google provider | Restrict domain `@cyberlogitec.com` ở callback. Session JWT |
| **Backend** | **Next.js Route Handlers** (`app/api/*`) | Cùng repo, cùng deploy. Nếu BE scale ra → tách sang NestJS sau (M3 mở rộng) |
| **Database** | **PostgreSQL 15** + **Prisma** ORM | Transactional locking cho booking critical section |
| **Validation (shared)** | **Zod** schemas trong `packages/shared/` | Single source of truth FE ↔ BE |
| **Testing** | Vitest (unit) · React Testing Library (component) · Playwright (e2e) | Standard |
| **Linting/format** | ESLint (Next config) · Prettier · TypeScript strict | — |
| **CI/CD** | GitHub Actions → deploy lên internal VPS (Docker Compose) hoặc Vercel Enterprise nếu được duyệt | Phụ thuộc IT policy CyberLogitec |
| **Monitoring** | Sentry (errors) + Pino logs | Audit log booking phải lưu DB, không chỉ Sentry |

### 1.1 Tương thích với codebase prototype hiện tại

Prototype hiện dùng React UMD + Babel inline + global `window` exports. Migration path:

| Prototype | Production |
|---|---|
| `app.jsx` `<App>` state machine | App Router pages: `/signin`, `/booking/info`, `/booking/calendar`, `/booking/confirm`, `/booking/success`, `/booking` (display) |
| `data.js` `SLOTS` mock array | `GET /api/slots?weekId=...` trả về cùng shape |
| `localStorage` (`corgi7.proto.v1`) | Server session + DB. Localstorage chỉ dùng cho **UI draft** (chưa submit) |
| `components.jsx` `<Topbar>` `<Stepper>` `<Modal>` `<Toast>` | `components/ui/*.tsx` — port 1:1, đổi `className` → CSS Module |
| `screen-*.jsx`, `step2-calendar.jsx` | `components/booking/*.tsx` |

→ **CSS tokens, layout, copywriting Việt giữ nguyên 100%**.

---

## 2. Kiến trúc

```
┌──────────────────────────────────────────────────────────────┐
│                       Browser (Next.js)                       │
│   pages/components ── React Query ── NextAuth session ──┐    │
└──────────────────────────────────────┬───────────────────│────┘
                                       │ HTTPS               │
┌──────────────────────────────────────▼───────────────────▼───┐
│              Next.js Route Handlers (/api/*)                  │
│  Zod validate ── Service layer ── Prisma ── Audit logger     │
└──────────────────────────────────────┬───────────────────────┘
                                       │
                          ┌────────────▼────────────┐
                          │   PostgreSQL 15         │
                          │  (row-level lock cho    │
                          │   slot booking)         │
                          └─────────────────────────┘
```

### 2.1 Folder structure đề xuất

```
booking-web/
├─ app/
│  ├─ (auth)/signin/page.tsx
│  ├─ (booking)/
│  │  ├─ layout.tsx              # Topbar + Stepper shell
│  │  ├─ info/page.tsx           # Step 1
│  │  ├─ calendar/page.tsx       # Step 2
│  │  ├─ success/page.tsx
│  │  └─ page.tsx                # Booking display (after registered)
│  ├─ api/
│  │  ├─ auth/[...nextauth]/route.ts
│  │  ├─ profile/route.ts        # GET/PATCH user info
│  │  ├─ slots/route.ts          # GET slots for current week
│  │  ├─ booking/
│  │  │  ├─ route.ts             # POST create, GET current
│  │  │  ├─ change/route.ts      # POST change
│  │  │  └─ cancel/route.ts      # POST cancel
│  │  └─ admin/                  # M3 — admin panel API
│  └─ layout.tsx
├─ components/
│  ├─ ui/                        # Topbar, Stepper, Modal, Toast, Button, Input, Pill
│  ├─ booking/                   # Step1Form, Calendar, SlotBlock, StickySummary, ConfirmModal, BookingDisplay
│  └─ providers/                 # QueryProvider, SessionProvider, ToastProvider
├─ lib/
│  ├─ auth.ts                    # NextAuth config + domain check
│  ├─ db.ts                      # Prisma client singleton
│  ├─ booking-service.ts         # Core booking logic (locking, validation)
│  └─ deadline.ts                # computeDeadline(now) → { daysLeft, hoursLeft, expired }
├─ shared/
│  ├─ schemas.ts                 # Zod schemas (Profile, Slot, Booking, ...)
│  └─ types.ts
├─ styles/
│  ├─ tokens.css                 # Copy nguyên từ prototype
│  └─ globals.css
├─ prisma/
│  └─ schema.prisma
├─ tests/
│  ├─ unit/
│  ├─ component/
│  └─ e2e/
└─ design_handoff_booking_flow/  # Giữ làm reference
```

---

## 3. Data Model & API Contract

### 3.1 Database schema (Prisma)

```prisma
model User {
  id          String   @id @default(cuid())
  email       String   @unique             // *.cyberlogitec.com only
  googleSub   String   @unique
  shortName   String?
  createdAt   DateTime @default(now())

  profile     Profile?
  bookings    Booking[]
}

model Profile {
  userId      String   @id
  empCode     String   @unique             // 6-digit, validated
  fullName    String
  bu          String                       // uppercase, 2-20 chars
  updatedAt   DateTime @updatedAt
  user        User     @relation(fields: [userId], references: [id])
}

model Window {                              // booking window (Q2 2026)
  id          String   @id
  label       String                       // "Q2 2026 · English Proficiency Test"
  weekStart   DateTime
  weekEnd     DateTime
  bookingDeadline DateTime
  maxChanges  Int      @default(3)
  slots       Slot[]
  bookings    Booking[]
}

model Slot {
  id          String   @id @default(cuid())
  windowId    String
  type        SlotType                     // SPEAKING | SKILLS
  dayDate     DateTime                     // date only
  startMin    Int                          // minutes from 00:00
  endMin      Int
  room        String
  capacity    Int
  // taken is DERIVED from BookingItem.count — not stored to avoid drift
  window      Window   @relation(fields: [windowId], references: [id])
  items       BookingItem[]

  @@index([windowId, dayDate])
}

enum SlotType { SPEAKING SKILLS }

model Booking {
  id            String   @id @default(cuid())
  userId        String
  windowId      String
  state         BookingState                 // ACTIVE | CANCELLED
  changesUsed   Int      @default(0)
  registeredAt  DateTime @default(now())
  updatedAt     DateTime @updatedAt
  items         BookingItem[]                // exactly 2 when ACTIVE: 1 SPEAKING + 1 SKILLS

  user          User     @relation(fields: [userId], references: [id])
  window        Window   @relation(fields: [windowId], references: [id])

  @@unique([userId, windowId])               // 1 booking per user per window
}

enum BookingState { ACTIVE CANCELLED }

model BookingItem {
  id          String   @id @default(cuid())
  bookingId   String
  slotId      String
  booking     Booking  @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  slot        Slot     @relation(fields: [slotId], references: [id])

  @@unique([bookingId, slotId])
}

model AuditLog {
  id        String   @id @default(cuid())
  userId    String
  action    String                            // BOOKING_CREATED, BOOKING_CHANGED, BOOKING_CANCELLED, PROFILE_UPDATED
  payload   Json
  createdAt DateTime @default(now())

  @@index([userId, createdAt])
}
```

**Lý do `taken` derived, không lưu**: tránh drift khi booking bị cancel/change. Query `SELECT count(*) FROM BookingItem WHERE slotId = X AND booking.state = ACTIVE` với index. Nếu thấy chậm ở > 10k users → cache trong Redis hoặc materialized view.

### 3.2 API contract

Tất cả endpoint:
- **Auth**: yêu cầu session NextAuth (trừ `/api/auth/*`)
- **Error shape**: `{ error: { code: string, message: string, details?: unknown } }` HTTP 4xx/5xx
- **Success shape**: data object trực tiếp, HTTP 2xx
- **Idempotency**: POST `/booking` và `/booking/change` nhận header `Idempotency-Key` (UUID client-gen)

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| GET | `/api/me` | — | `{ user, profile?, booking?, window }` | Bootstrap call sau sign-in. Trả mọi thứ client cần |
| PATCH | `/api/profile` | `{ empCode, fullName, bu }` | `{ profile }` | Tạo or update. Validate `empCode` chưa bị user khác claim |
| GET | `/api/slots?windowId=X` | — | `{ slots: Slot[], window }` | Slot kèm `remaining` derived. Cache 10s |
| POST | `/api/booking` | `{ speakingSlotId, skillsSlotId }` | `{ booking }` | **Transaction + row lock** (xem §6) |
| POST | `/api/booking/change` | `{ speakingSlotId, skillsSlotId }` | `{ booking }` | Decrement `changesUsed`. 409 nếu hết quota |
| POST | `/api/booking/cancel` | — | `{ booking }` | State → CANCELLED. Item rows giữ lại cho audit nhưng filter ra khi count |

### 3.3 Error codes

| Code | HTTP | Khi nào |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Không có session |
| `WRONG_DOMAIN` | 403 | Email không phải `@cyberlogitec.com` |
| `DEADLINE_PASSED` | 403 | `now > window.bookingDeadline` |
| `VALIDATION_FAILED` | 422 | Zod schema fail |
| `EMP_CODE_TAKEN` | 409 | Mã NV đã được user khác claim |
| `SLOT_NOT_FOUND` | 404 | slotId không tồn tại |
| `SLOT_FULL` | 409 | Slot hết chỗ khi commit |
| `SLOT_CONFLICT` | 409 | 2 slot trùng giờ |
| `INVALID_PAIRING` | 422 | Không phải 1 SPEAKING + 1 SKILLS |
| `CHANGE_QUOTA_EXCEEDED` | 409 | `changesUsed >= window.maxChanges` |
| `BOOKING_NOT_FOUND` | 404 | Cancel/change khi chưa book |
| `INTERNAL_ERROR` | 500 | — |

---

## 4. Component Breakdown

Port từ prototype, group theo trách nhiệm. Mỗi component dưới đây là 1 file `.tsx` riêng.

### 4.1 UI primitives (`components/ui/`)

| Component | Props | Notes |
|---|---|---|
| `Button` | `variant: 'primary' \| 'ghost' \| 'danger' \| 'link'`, `disabled`, `loading`, `onClick`, `children` | Replaces inline `<button className="btn ...">` |
| `Input` | `value`, `onChange`, `error?`, `help?`, `success?`, native input props | Wraps existing `.input` styles |
| `Pill` | `variant: 'brand' \| 'warn' \| 'danger'`, `icon?`, `children` | For deadline |
| `Topbar` | `user`, `window`, `onSignOut` | Server component reading session, đẩy callback xuống client |
| `Stepper` | `current: 1 \| 2 \| 3` | Pure presentational |
| `Modal` | `title?`, `subtitle?`, `footer?`, `maxWidth?`, `onClose`, children | Keep ESC handling |
| `Toast` + `useToast()` | — | Port nguyên từ prototype, đẩy lên Context để mọi page dùng được |
| `Banner` | `variant: 'info' \| 'danger' \| 'success'`, icon, children | Inline notice |

### 4.2 Booking components (`components/booking/`)

| Component | Props | Source |
|---|---|---|
| `Step1Form` | `initialProfile?`, `onSubmit(profile)` | `screen-signin-step1.jsx` |
| `Calendar` | `slots`, `selection`, `onToggle(slot)`, `conflicts` | `step2-calendar.jsx` — core view |
| `SlotBlock` | `slot`, `status: 'ok' \| 'sel' \| 'full' \| 'conflict'`, `onClick` | Extract khỏi Calendar để test |
| `StickySummary` | `speaking?`, `skills?`, `canSubmit`, `onBack`, `onContinue` | Bottom bar |
| `ConfirmModal` | `user`, `selection`, `onConfirm`, `onCancel` | Reuses `Modal` |
| `BookingDisplay` | `user`, `booking`, `window`, `onChange`, `onCancel` | Post-registration view |
| `CancelConfirmModal` | `onConfirm`, `onClose` | Danger modal |
| `DeadlinePill` | `deadline` | Derived from `window.bookingDeadline` via `lib/deadline.ts` |

**Bỏ khỏi production**: `DemoNav` (chỉ phục vụ review prototype).

### 4.3 Provider tree

```tsx
<SessionProvider>          // NextAuth
  <QueryProvider>          // TanStack Query
    <ToastProvider>
      <BookingDraftProvider>  // Client-only draft selection (Step 2 trước khi submit)
        {children}
      </BookingDraftProvider>
    </ToastProvider>
  </QueryProvider>
</SessionProvider>
```

`BookingDraftProvider` lưu `{ speakingSlotId, skillsSlotId }` trong React state + localStorage để user F5 không mất chọn. **Khác với prototype**: ở production, draft KHÔNG được dùng làm source of truth cho booking đã commit — đó là server data từ `GET /api/me`.

---

## 5. Routing & Navigation

```
/                          → redirect /signin hoặc /booking tùy session+booking state
/signin                    → SignInScreen (public)
/booking/info              → Step 1
/booking/calendar          → Step 2
/booking/confirm           → (no separate page — ConfirmModal trên /booking/calendar)
/booking/success           → SuccessScreen sau khi book lần đầu
/booking                   → BookingDisplay (đã có booking active)
```

### 5.1 Middleware

`middleware.ts` chạy trên mọi route `/booking/*`:

1. Không có session → redirect `/signin`
2. Email không match `@cyberlogitec.com` → redirect `/signin?error=wrong_domain`
3. `now > window.bookingDeadline` AND không có booking → redirect `/signin?error=deadline_passed` (read-only mode)
4. Có booking active AND route là `/booking/info` hoặc `/booking/calendar` AND không có query `?edit=1` → redirect `/booking`

### 5.2 State machine guard (client)

```
                ┌─────────────────────────────────────┐
                ▼                                     │
   signin ──► info ──► calendar ──► (confirm) ──► success
                ▲          │                            │
                └─ edit ───┴────── booking ◄────────────┘
                                      │
                                   cancel
                                      │
                                      ▼
                                    info
```

Guards:
- Không có profile → cấm vào `/booking/calendar` (server-side redirect về `/booking/info`)
- Hết quota change → button "Đổi ca" trên `/booking` disabled, server trả 409 nếu vẫn POST

---

## 6. State Management

### 6.1 Server state (React Query)

| Query key | Endpoint | Stale time | Refetch trigger |
|---|---|---|---|
| `['me']` | `GET /api/me` | 30s | Sign-in, mutations |
| `['slots', windowId]` | `GET /api/slots?windowId=X` | 10s | Mở `/booking/calendar`, sau khi tab visible lại, sau mutations |

| Mutation | Invalidates | Optimistic? |
|---|---|---|
| `updateProfile` | `['me']` | Không |
| `createBooking` | `['me']`, `['slots']` | Không (server là source of truth) |
| `changeBooking` | `['me']`, `['slots']` | Không |
| `cancelBooking` | `['me']`, `['slots']` | Có (đánh dấu cancelled ngay, rollback nếu fail) |

### 6.2 Client state

| State | Where | Lifetime |
|---|---|---|
| `selectionDraft` | `BookingDraftProvider` + localStorage | Cho đến khi submit thành công hoặc explicit reset |
| `showConfirmModal`, `showCancelModal` | Local component state | Component mount |
| `toasts` | `ToastProvider` | Per-toast TTL |

**Quan trọng**: Sau khi `createBooking` 200, **xoá** `selectionDraft` khỏi localStorage. Nếu user vào lại `/booking/calendar?edit=1` (đổi ca), seed lại draft từ server booking.

### 6.3 Concurrency: race condition khi book

Đây là phần critical. Flow `POST /api/booking`:

```ts
async function createBooking(userId, windowId, speakingSlotId, skillsSlotId) {
  return prisma.$transaction(async (tx) => {
    // 1. Lock window row, kiểm tra deadline
    const win = await tx.$queryRaw`
      SELECT * FROM "Window" WHERE id = ${windowId} FOR UPDATE
    `;
    if (new Date() > win.bookingDeadline) throw new ApiError('DEADLINE_PASSED');

    // 2. Lock 2 slot rows (theo thứ tự ID tăng dần để tránh deadlock)
    const slots = await tx.$queryRaw`
      SELECT * FROM "Slot"
      WHERE id IN (${speakingSlotId}, ${skillsSlotId})
      ORDER BY id
      FOR UPDATE
    `;
    // 3. Validate: đúng type
    const sp = slots.find(s => s.type === 'SPEAKING' && s.id === speakingSlotId);
    const sk = slots.find(s => s.type === 'SKILLS' && s.id === skillsSlotId);
    if (!sp || !sk) throw new ApiError('INVALID_PAIRING');

    // 4. Validate: không trùng giờ cùng ngày
    if (overlaps(sp, sk)) throw new ApiError('SLOT_CONFLICT');

    // 5. Count active items per slot
    const counts = await tx.bookingItem.groupBy({
      by: ['slotId'],
      where: {
        slotId: { in: [sp.id, sk.id] },
        booking: { state: 'ACTIVE', windowId },
      },
      _count: true,
    });
    for (const s of [sp, sk]) {
      const c = counts.find(x => x.slotId === s.id)?._count ?? 0;
      if (c >= s.capacity) throw new ApiError('SLOT_FULL', { slotId: s.id });
    }

    // 6. Check user chưa có booking active
    const existing = await tx.booking.findUnique({
      where: { userId_windowId: { userId, windowId } },
    });
    if (existing && existing.state === 'ACTIVE') {
      throw new ApiError('ALREADY_BOOKED');
    }

    // 7. Create or update
    return tx.booking.upsert({
      where: { userId_windowId: { userId, windowId } },
      create: {
        userId, windowId, state: 'ACTIVE',
        items: { create: [{ slotId: sp.id }, { slotId: sk.id }] },
      },
      update: {
        state: 'ACTIVE', changesUsed: 0,
        items: { deleteMany: {}, create: [{ slotId: sp.id }, { slotId: sk.id }] },
      },
      include: { items: { include: { slot: true } } },
    });
  }, { isolationLevel: 'Serializable' });
}
```

`change` flow tương tự nhưng:
- Yêu cầu `existing.state === 'ACTIVE'`
- Increment `changesUsed`, kiểm `< window.maxChanges`

---

## 7. Validation Rules

### 7.1 Profile (Zod schema, shared)

```ts
export const ProfileSchema = z.object({
  empCode: z.string().regex(/^\d{6}$/, 'Mã NV phải có đúng 6 chữ số'),
  fullName: z.string().trim().min(2, 'Tên tối thiểu 2 ký tự').max(50),
  bu: z.string().trim().min(2).max(20).transform(s => s.toUpperCase()),
});
```

- FE: React Hook Form + `zodResolver` → live validate
- BE: Re-validate, thêm check `empCode` chưa bị claim (DB unique constraint + 409 mapping)

### 7.2 Booking selection

```ts
export const BookingSchema = z.object({
  speakingSlotId: z.string().cuid(),
  skillsSlotId: z.string().cuid(),
}).refine(d => d.speakingSlotId !== d.skillsSlotId, 'Hai ca không được trùng id');
```

Business rules (kiểm ở service layer, không chỉ schema):
1. `speakingSlotId.type === SPEAKING`
2. `skillsSlotId.type === SKILLS`
3. Cùng `windowId`
4. Không overlap thời gian cùng ngày: `sp.start < sk.end && sk.start < sp.end && sp.dayDate === sk.dayDate`
5. Còn chỗ (capacity check trong transaction)
6. Window chưa qua deadline

### 7.3 UI feedback rules (port từ prototype)

| Trường | Trạng thái live | Render |
|---|---|---|
| empCode | Đang gõ, chưa đủ 6 số | help: gray "Còn N chữ số" |
| empCode | 6 số, regex pass | help: green "✓ Hợp lệ" |
| empCode | 6 số nhưng API trả `EMP_CODE_TAKEN` | error: red "Mã NV đã được đăng ký bởi user khác" |
| Submit button | Bất kỳ trường nào invalid | disabled, hiển thị "N/3 trường hợp lệ" |
| Submit | All valid | enabled, "Tiếp tục →" |

---

## 8. Edge Cases & Error States

### 8.1 Auth edge cases

| Case | Handling |
|---|---|
| User đăng nhập bằng email không phải `@cyberlogitec.com` | NextAuth `signIn` callback return `false` + redirect `/signin?error=wrong_domain`. Hiện banner đỏ trên signin |
| Session expire giữa flow | Mọi mutation trả 401 → React Query interceptor toast "Phiên hết hạn" + redirect signin |
| User đổi email trên Google sau khi đã đăng ký | `googleSub` là khóa thật, email chỉ display. Login lại với cùng sub → match user cũ |

### 8.2 Booking edge cases

| Case | Handling |
|---|---|
| User A và B cùng book slot cuối lúc 14:23:00.001 và 14:23:00.002 | DB transaction serial → user B nhận 409 `SLOT_FULL` → UI toast đỏ + refetch slots → block trở thành "Hết" |
| User chọn slot, để mở tab 30 phút, slot bị người khác lấy | Khi click Submit, BE trả `SLOT_FULL` → modal "Ca này vừa hết chỗ. Vui lòng chọn lại." → reset selection của slot đó, giữ slot còn lại |
| User đã book, đóng tab, quay lại | `GET /api/me` trả `booking.state === ACTIVE` → middleware redirect `/booking` (display) |
| User cố vào URL `/booking/calendar` khi đã book mà không click "Đổi ca" | Middleware check, redirect `/booking` |
| User click "Đổi ca" lần thứ 4 | Button đã disabled từ client (`changesUsed >= 3`). Nếu force POST, BE 409 `CHANGE_QUOTA_EXCEEDED` |
| Deadline pass khi user đang ở Step 2 với selection draft | Submit trả 403 `DEADLINE_PASSED` → modal "Đã hết hạn đăng ký" + nút "Về trang chủ" |
| User click cancel rồi đổi ý | Cancel có modal confirm. Sau cancel, `changesUsed` reset về 0 (có thể đăng ký lại từ đầu — confirm với BTC business rule) |
| 2 tab cùng mở `/booking/calendar`, tab A book xong, tab B vẫn còn draft | Tab B submit → 409 `ALREADY_BOOKED` → toast + redirect `/booking` |

### 8.3 Network / loading states

Mỗi page có 3 trạng thái:
- **Loading**: skeleton (Topbar shimmer, calendar grid xám)
- **Error**: full-page error card với "Thử lại"
- **Empty**: chỉ Step 2 cần — nếu window không có slot nào (deadline pass tuần) → message "Không có ca thi trong tuần này"

### 8.4 Accessibility

- Calendar block: `<button>` đã đúng, thêm `aria-label` đầy đủ (`"Speaking 09:00–10:00, Phòng A T5, còn 6 chỗ"`)
- Modal: focus trap, ESC close (prototype đã có)
- Stepper: `aria-current="step"` trên step active
- Form: `aria-invalid`, `aria-describedby` link tới help text
- Toast: `role="status"` / `role="alert"` tùy variant

---

## 9. Milestones (8–12 tuần, 2–3 devs)

Giả định **2 devs full-stack + 1 dev part-time (FE-leaning)**. Velocity ~25 story points/sprint, 2-week sprints.

### M0 · Setup (Tuần 1) — 1 dev

- [ ] Khởi tạo Next.js 14 + TS + ESLint + Prettier
- [ ] Cài Prisma, init schema, migration đầu tiên
- [ ] NextAuth Google provider + domain restrict
- [ ] Tokens.css migrate từ prototype, layout shell
- [ ] CI: GitHub Actions (lint + typecheck + test)
- [ ] Deploy staging environment

**Deliverable**: User Google sign-in vào được landing page trống.

### M1 · Profile & Calendar read-only (Tuần 2–3) — 2 devs

- [ ] Schema Window/Slot, seed data Q2 2026 từ `data.js`
- [ ] `GET /api/me`, `GET /api/slots`
- [ ] Topbar, Stepper, Modal, Toast primitives
- [ ] `/booking/info` Step 1 form + `PATCH /api/profile`
- [ ] `/booking/calendar` Calendar view read-only (chưa click được book)
- [ ] Unit tests cho schemas, deadline lib
- [ ] Component tests cho Stepper, Topbar

**Deliverable**: User điền info, xem calendar render đúng từ DB. Chưa book được.

### M2 · Booking core (Tuần 4–6) — 2–3 devs

- [ ] SlotBlock click interactions, conflict detection FE
- [ ] StickySummary
- [ ] `POST /api/booking` với transaction + locking
- [ ] ConfirmModal flow
- [ ] `/booking/success`
- [ ] `/booking` BookingDisplay
- [ ] AuditLog ghi mọi action
- [ ] **Concurrency tests**: spawn 20 concurrent requests vào 1 slot capacity=5, expect exactly 5 success
- [ ] E2E happy path: signin → info → book → success → display

**Deliverable**: Một user có thể đăng ký 2 ca từ đầu đến cuối, dữ liệu persist.

### M3 · Change/Cancel + edge cases (Tuần 7–8) — 2 devs

- [ ] `POST /api/booking/change` + button "Đổi ca" trên Display
- [ ] `POST /api/booking/cancel` + CancelConfirmModal
- [ ] DeadlinePill live countdown, middleware deadline guard
- [ ] Tất cả error states ở §8 — modal/toast tương ứng
- [ ] React Query invalidation đầy đủ
- [ ] E2E: change flow, cancel flow, quota exhaust

**Deliverable**: Full booking lifecycle production-ready.

### M4 · Polish + Admin (Tuần 9–10) — 2 devs

- [ ] Accessibility audit + fixes (axe-core)
- [ ] Loading skeletons, empty states
- [ ] Sentry integration + alerts
- [ ] Performance: slot query index check, Lighthouse > 90
- [ ] Admin panel tối thiểu: list bookings, export CSV (M4 nice-to-have, có thể defer)
- [ ] Pen-test internal trên staging

**Deliverable**: Production-ready release candidate.

### M5 · UAT + Launch (Tuần 11–12) — 1 dev hỗ trợ

- [ ] BTC UAT round
- [ ] Bug fixes
- [ ] Production deploy + smoke test
- [ ] Runbook + on-call doc

**Deliverable**: Live.

---

## 10. Risks & Open Questions

| Risk | Mitigation |
|---|---|
| **Race condition khi nhiều user book cùng slot** | Serializable isolation + row lock. Load test trước launch (k6 với 100 concurrent). |
| **`@cyberlogitec.com` không phải domain duy nhất hợp lệ** | Confirm với BTC — có cần whitelist thêm subsidiary domain? |
| **Booking window logic — có nhiều window song song không?** | Hiện schema đã hỗ trợ multi-window. Chốt với BTC: 1 user 1 booking / window. |
| **Quota change 3 reset sau cancel — đúng business?** | Cần confirm. Đề xuất: KHÔNG reset (chống abuse), nhưng prototype hiện đang reset. |
| **Performance khi >1000 user spike** | Slot query có index `(windowId, dayDate)`. Cache slots ở edge với 10s SWR. Nếu vẫn chậm → Redis cache count. |
| **Audit log retention** | Chốt policy với security: 1 năm? 5 năm? |
| **i18n** | Hiện chỉ Việt. Nếu cần thêm EN sau, dùng `next-intl` — chi phí thêm ~3 ngày |

---

## 11. Questions cho BTC / Product

1. **Quota change reset sau cancel?** — Đề xuất KHÔNG, để chống lạm dụng.
2. **Email reminder** — Có gửi mail sau khi book / 24h trước ca thi không? (chưa có trong scope, cần xác nhận)
3. **Calendar export** — `.ics` file để add vào Google Calendar / Outlook?
4. **Đăng ký giùm** (admin thay user) — có support không? Nếu có → M4 admin panel scope sẽ lớn hơn.
5. **Báo cáo** — BTC cần report gì? List per slot, list per BU, no-show tracking?
6. **Eligibility check** — Prototype có message "Hệ thống sẽ kiểm tra eligibility". Logic eligibility là gì? Có API HR để gọi?
7. **Whitelist domain** — Có domain nào khác ngoài `@cyberlogitec.com`?

---

## 12. Appendix · Acceptance criteria mẫu (cho QA)

### AC-01 · Sign-in domain restriction
- **Given** user có email `foo@gmail.com`
- **When** click "Đăng nhập với Google"
- **Then** redirect về `/signin?error=wrong_domain` và hiển thị banner đỏ "Chỉ chấp nhận @cyberlogitec.com"

### AC-02 · Booking happy path
- **Given** user đã hoàn thành Step 1
- **And** user chọn 1 slot SPEAKING + 1 slot SKILLS không trùng giờ
- **When** click "Xác nhận đăng ký" trong modal
- **Then** redirect về `/booking/success`
- **And** `GET /api/me` trả `booking.state === 'ACTIVE'` với đúng 2 items
- **And** AuditLog có row `BOOKING_CREATED`

### AC-03 · Concurrent booking trên slot cuối
- **Given** slot X có `capacity=1`, đã có 0 booking
- **When** 5 user đồng thời POST `/api/booking` với `speakingSlotId=X`
- **Then** chính xác 1 user nhận 200
- **And** 4 user còn lại nhận 409 `SLOT_FULL`
- **And** DB chỉ có 1 BookingItem cho slot X

(QA viết tiếp các AC-04 trở đi cho mỗi error code và mỗi edge case ở §8.)

---

**Tài liệu này là plan v1.** Dev review xong, chốt câu hỏi ở §11 với BTC, rồi tách thành tickets trên Jira/Linear theo milestone.
