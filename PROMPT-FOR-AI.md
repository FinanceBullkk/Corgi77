# Prompt: Review & Implement Corgi7 Security Fixes

> Copy everything below the line and paste into a new Cline/AI session.

---

You are working on the **Corgi7** project — an Assessment slot booking system (React + Firebase + Firestore) at `/Users/hao/Documents/GitHub/Corgi7`.

## Your Task

Read the two report files in the project root, then implement all changes described:

1. **`REVIEW-REPORT.md`** — Full audit report with issues, edge cases, uncovered use cases
2. **`IMPLEMENTATION-PLAN.md`** — Step-by-step implementation plan with acceptance criteria

## Execution Order

### Step 0: Understand the codebase
- Read `REVIEW-REPORT.md` and `IMPLEMENTATION-PLAN.md` thoroughly
- Read all existing source files referenced in the reports (`firestore.rules`, `src/lib/db.ts`, `src/lib/adminDb.ts`, `src/lib/admin.ts`, `src/App.tsx`, `src/AdminPanel.tsx`, `src/lib/firebase.ts`, `package.json`)
- Understand current architecture before making any changes

### Step 1: Implement Phase 1 (P0 — Security Fixes)
Do these **in order**, each as a separate step:

**1.1 — Fix Firestore Rules for Slots** (`firestore.rules`)
- Change slot `allow write` from `request.auth != null` to `isAdmin()`
- Add field validation for slot documents
- Add `remaining >= 0` constraint
- Test: non-admin should get permission-denied on slot writes

**1.2 — Move Deadline Check to Server Side** (`firestore.rules` + `src/lib/db.ts`)
- Add `isEnrollmentOpen()` helper function in Firestore rules
- Use `request.time` (server time) instead of client `new Date()`
- Apply deadline + allowEnrollment checks to registrations create/update/delete rules
- Keep client-side check in `db.ts` as UX only, add clarifying comment
- User cannot bypass deadline by changing system clock

**1.3 — Add Eligibility Collection and Check** (`firestore.rules` + `src/lib/db.ts`)
- Define `eligibility/{email}` collection in Firestore rules
- Add `isEligible()` helper in Firestore rules
- Add client-side eligibility check in `db.ts` before booking transaction
- Must be backward-compatible: if no eligibility docs exist, allow all users

**1.4 — Add Audit Logging** (new file `src/lib/audit.ts` + modify `db.ts`, `adminDb.ts`)
- Create `src/lib/audit.ts` with `auditLog()` function
- Uses `serverTimestamp()`, writes to `/auditLogs/{auto-id}`
- Audit calls must be **non-blocking** (try/catch, console.warn on failure)
- Add calls in: `bookDb()` (create/update), `cancelDb()`, `adminDeleteRegistration()`, `updateSlot()`, `updateConfig()`
- Add Firestore rules: read=isAdmin, create=any auth, update/delete=false (immutable)

### Step 2: Implement Phase 2 (P1 — Feature Parity)

**2.1 — Unified Admin Email Source** (`src/lib/admin.ts` + `src/App.tsx`)
- Read admin emails from Firestore `/config/main.adminEmails` array
- Make `isAdmin()` async
- Keep hardcoded `ADMIN_EMAILS` as fallback during initial load
- Update `App.tsx` to handle async admin check

**2.2 — Admin "Not Yet Registered" List** (`src/lib/adminDb.ts` + `src/AdminPanel.tsx`)
- Add `getNotRegistered()` function
- Compare `/eligibility` docs vs `/registrations` docs
- Add new tab or section in AdminPanel
- Handle case where no eligibility collection exists

**2.3 — Slot Management UI** (`src/lib/adminDb.ts` + `src/AdminPanel.tsx`)
- Add "Add Slot" button + form (type, date, session, startMin, endMin, capacity, location)
- Auto-generate slotId from convention
- Add "Delete" button per slot with confirmation dialog
- Warn if slot has bookings before deletion
- Audit-log both operations

**2.4 — Slot Drill-Down** (`src/AdminPanel.tsx`)
- Add click handler on slot rows to expand and show registrants
- Query registrations by speakingSlotId or skillsSlotId
- Show email, empCode, fullName, BU per registrant

**2.5 — Confirmation Email** (`src/lib/db.ts`)
- After successful booking, write to `/mail` collection for Firebase Extension
- Controlled by `config.emailConfirm` flag
- Email failure must not block booking

**2.6 — Update README** (`README.md`)
- Rewrite to describe Firebase workflow
- Add setup, deployment, admin guide
- Mark GAS code as deprecated

### Step 3: Implement Phase 3 (P2 — Improvements)
Do these only if time permits:

**3.1** — Realtime slot listeners (`onSnapshot` in `initDb`)
**3.2** — Bulk CSV import for slots and eligibility
**3.3** — Rate limiting (client-side debounce + optional server-side)
**3.4** — Pagination for admin registrations (50 per page)
**3.5** — Guard against orphan registrations when deleting slots
**3.6** — Fix `initDb('')` wasteful call in AdminPanel

## Rules

1. **Do NOT skip P0 items.** These are security-critical.
2. **Test each change** by reading the code and verifying the logic. If Firebase emulator is available, use it.
3. **Maintain backward compatibility** — existing bookings and flow must still work.
4. **Non-blocking audit** — audit log failures must never block booking/cancel operations.
5. **Use the existing code style** — follow patterns already in `db.ts` and `adminDb.ts`.
6. **After each phase**, update `IMPLEMENTATION-PLAN.md` checkboxes to mark completed items.
7. **After all phases**, create a summary of what was changed in each file.

## Success Criteria

When done, the following must be true:
- [ ] Non-admin user CANNOT modify slots via Firestore SDK
- [ ] Deadline enforced server-side (request.time), not client time
- [ ] Eligibility check works (with backward-compatible fallback)
- [ ] Every book/cancel/admin action creates an immutable audit log
- [ ] Admin emails defined in single source (Firestore), with client fallback
- [ ] Admin can see "not yet registered" list
- [ ] Admin can add/delete slots from UI
- [ ] Admin can drill-down into slot to see registrants
- [ ] Confirmation email sent on booking (if enabled)
- [ ] README accurately describes Firebase architecture
- [ ] No regressions in existing booking/admin functionality