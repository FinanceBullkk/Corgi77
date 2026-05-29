# Assessment Booking — Dev Handoff

Package này gửi cho team dev để bắt đầu build production. Đọc theo thứ tự dưới đây.

---

## 📄 Đọc trước

1. **`IMPLEMENTATION_PLAN.md`** — kim chỉ nam toàn bộ project
   - Tech stack & rationale (§1)
   - Architecture + folder structure (§2)
   - Data model (Prisma) + API contract (§3)
   - Component breakdown (§4)
   - Routing + middleware (§5)
   - State management + concurrency code mẫu (§6)
   - Validation rules — Zod schemas (§7)
   - Edge cases & error states (§8)
   - **Milestones M0–M5** chia 8–12 tuần cho 2–3 devs (§9)
   - **Risks + Open questions** cần BTC trả lời (§10–§11) ← **BLOCKER**

2. **`prototype/01-hifi/Booking Flow Hi-fi.html`** — clickable prototype
   - Mở trong Chrome / Edge / Firefox, không cần build
   - DEMO nav bottom-left để jump giữa 5 screens
   - Test full flow: signin → info → calendar → confirm → success → display

3. **`prototype/02-wireframes/Booking Flow Wireframes.html`** — wireframes gốc (reference, để hiểu intent design)

4. **`CALENDAR_REDESIGN.md`** — ⭐ bản vá UI mới nhất cho lịch Step 2 (mô hình cột absolute kiểu Google/Outlook). Đọc trước khi đụng `calendar.css` / `step2-calendar.jsx`.

---

## 🎨 Lift trực tiếp từ prototype

Khi build production, dev copy nguyên từ `prototype/01-hifi/`:

| File | Mục đích |
|---|---|
| `tokens.css` | **TẤT CẢ** design tokens — colors, spacing, radius, shadow, type. Copy nguyên vào `styles/tokens.css` của Next.js project |
| `styles.css` | Base styles — topbar, stepper, modal, toast, banner, button, input. Port sang CSS Modules |
| `calendar.css` | Step 2 calendar (tabbed view) styles |
| `screens.css` | Signin, success, booking display layouts |
| `data.js` | Mock slot data — dùng làm **seed data** cho DB |
| `*.jsx` | React components — port 1:1 (đã có mapping trong IMPLEMENTATION_PLAN §1.1 và §4) |

---

## ⚠️ Trước khi dev start code

### 1. Hỏi BTC 7 câu ở §11 của plan
Đặc biệt 3 câu blocker:
- Quota change reset sau cancel?
- Eligibility check là gì, có API HR không?
- Whitelist thêm domain nào ngoài `@cyberlogitec.com`?

### 2. Confirm tech stack với tech lead
Plan đề xuất Next.js 14 + Prisma + PostgreSQL + NextAuth. Nếu team không quen → thảo luận thay thế.

### 3. Setup repo + Jira board
- Tạo 5 epics (M0 → M5) theo §9
- Chia stories từ checklist trong mỗi milestone
- Sprint 0 = M0 setup (1 tuần)

---

## 📋 Acceptance Criteria cho QA

§12 trong plan đã viết 3 AC mẫu (sign-in domain, booking happy path, concurrent booking). QA viết tiếp các AC còn lại dựa trên §8 (Edge Cases).

---

## 🔧 Tech debt cần lưu ý

Prototype dùng:
- React UMD + Babel inline (không build) — production phải migrate sang Next.js + TS
- `localStorage` làm source of truth — production dùng DB + session
- Mock data trong `data.js` — production dùng `GET /api/slots`
- `DemoNav` ở bottom-left — **xoá** trong production

---

## 📞 Liên hệ

- **Designer / PM**: [tên bạn]
- **Plan version**: v1 (May 2026) — sẽ update v2 sau khi BTC trả lời §11
