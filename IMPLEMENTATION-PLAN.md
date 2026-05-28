# Corgi7 — Implementation Plan

> **Based on:** `REVIEW-REPORT.md` (28/05/2026)  
> **Goal:** Fix security gaps, achieve feature parity with GAS, and improve admin UX  
> **Estimated effort:** 5–8 working days

---

## Legend

| Priority | Meaning | Deadline |
|----------|---------|----------|
| 🔴 P0 | **Must fix before launch** — security holes | Before opening registration |
| 🟡 P1 | **Should fix soon** — feature parity with GAS | Within 1 week of launch |
| 🟢 P2 | **Nice to have** — UX improvements | Backlog |

---

## Phase 1: Security Fixes (P0) — Est: 2 days

### Task 1.1: Fix Firestore Rules for Slots

**Issue:** Issue-01  
**Priority:** 🔴 P0  
**Est:** 2 hours  
**Assignee:** Dev

**Problem:** Any authenticated user can write to `/slots/*`. Users can modify capacity, remaining, or delete slots by calling Firestore SDK directly.

**Steps:**
1. Open `firestore.rules`
2. Change slot write rule from `request.auth != null` to `isAdmin()`
3. Add validation rules for slot fields:
   ```
   match /slots/{slotId} {
     allow read: if request.auth != null;
     allow create: if isAdmin()
       && request.resource.data.type in ['Speaking', '3 Skills']
       && request.resource.data.capacity is int
       && request.resource.data.capacity > 0;
     allow update: if isAdmin()
       && request.resource.data.keys().hasAll(['slotId', 'type', 'date', 'session', 'startMin', 'endMin', 'capacity', 'remaining', 'location'])
       && request.resource.data.remaining >= 0;
     allow delete: if isAdmin();
   }
   ```
4. Test: Verify non-admin user gets "permission-denied" when trying to update a slot
5. Test: Verify admin can still update slots from AdminPanel

**Acceptance Criteria:**
- [x] Non-admin cannot create/update/delete slots via SDK
- [x] Admin can still manage slots via AdminPanel
- [x] `remaining >= 0` validation prevents negative values
- [x] Non-admin can still update `remaining` (booking flow) but ONLY that field, within [0, capacity]

**✅ Implemented** (firestore.rules `match /slots/{slotId}`)

---

### Task 1.2: Move Deadline Check to Server Side

**Issue:** Issue-02  
**Priority:** 🔴 P0  
**Est:** 3 hours  
**Assignee:** Dev

**Problem:** Deadline check uses `new Date()` (client time). Users can bypass by changing system clock.

**Steps:**
1. Add deadline validation in `firestore.rules` for the `registrations` collection:
   ```
   match /registrations/{email} {
     allow create: if isAdmin()
       || (request.auth != null
           && request.auth.token.email == email
           && isEnrollmentOpen());
     allow update: if isAdmin()
       || (request.auth != null
           && request.auth.token.email == email
           && isEnrollmentOpen());
     allow delete: if isAdmin()
       || (request.auth != null
           && request.auth.token.email == email
           && isEnrollmentOpen());
   }

   function isEnrollmentOpen() {
     let cfg = get(/databases/$(database)/documents/config/main);
     return cfg.data.allowEnrollment == true
       && (cfg.data.deadline == null || request.time < cfg.data.deadline);
   }
   ```
2. Keep client-side check as UX convenience (show "expired" banner), but **do not rely on it** for security
3. In `db.ts`, add comment: `// Client-side deadline check is UX only; server rules enforce real deadline`
4. Test: Set deadline to past, try to book via console → should get permission-denied

**Acceptance Criteria:**
- [x] Firestore rules enforce deadline server-side using `request.time`
- [x] Client-side still shows deadline UI for UX
- [x] User cannot bypass deadline by changing system clock

**✅ Implemented** (firestore.rules `isEnrollmentOpen()` + comments in `db.ts`)

---

### Task 1.3: Add Eligibility Collection and Check

**Issue:** Issue-03  
**Priority:** 🔴 P0  
**Est:** 4 hours  
**Assignee:** Dev

**Problem:** GAS has eligibility restriction. Firebase allows any `@cyberlogitec.com` user.

**Steps:**
1. Create Firestore collection `eligibility/{email}` with fields:
   ```
   /eligibility/{email}
     ├── fullName: string
     ├── bu: string
     └── empCode: string
   ```
2. Add Firestore rules:
   ```
   match /eligibility/{email} {
     allow read: if request.auth != null;
     allow write: if isAdmin();
   }
   ```
3. Add eligibility check to `firestore.rules` registration create:
   ```
   function isEligible() {
     return exists(/databases/$(database)/documents/eligibility/$(request.auth.token.email));
   }
   ```
   Use in `registrations` create rule: `&& isEligible()`
4. In `src/lib/db.ts`, add eligibility check before `bookDb` transaction:
   ```typescript
   const eligSnap = await getDoc(doc(db, 'eligibility', email));
   if (!eligSnap.exists()) throw new Error('Bạn không nằm trong danh sách đăng ký thi.');
   ```
5. Handle gracefully when eligibility collection doesn't exist (backward compatible — like GAS)

**Acceptance Criteria:**
- [x] If `config.requireEligibility=true` → only emails in `/eligibility` can book
- [x] If `requireEligibility=false` (default) → all users can book (backward compatible)
- [x] Firestore rules enforce eligibility server-side

**✅ Implemented** (firestore.rules `isEligible()` + `checkEligibility()` in db.ts + admin UI to manage)

**Note:** Used `config.requireEligibility` flag (instead of "empty collection = allow all") because Firestore rules cannot list collections to check emptiness.

---

### Task 1.4: Add Audit Logging

**Issue:** Issue-04  
**Priority:** 🔴 P0  
**Est:** 3 hours  
**Assignee:** Dev

**Problem:** No traceability. Cannot track who booked/cancelled/changed what.

**Steps:**
1. Create Firestore subcollection: `/auditLogs/{auto-id}` with fields:
   ```
   /auditLogs/{id}
     ├── timestamp: Timestamp (server)
     ├── email: string
     ├── event: "book.create" | "book.update" | "book.cancel" | "admin.delete" | "admin.updateSlot" | "admin.updateConfig"
     ├── detail: map { empCode, fullName, bu, sp, sk, prevSp, prevSk, changeCount }
     └── ip: string (optional, from request)
   ```
2. Add Firestore rules:
   ```
   match /auditLogs/{id} {
     allow read: if isAdmin();
     allow create: if request.auth != null;  // any authenticated user can log
     allow update, delete: if false;  // immutable
   }
   ```
3. Create `src/lib/audit.ts`:
   ```typescript
   import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
   import { db } from './firebase';

   export async function auditLog(
     email: string,
     event: string,
     detail?: Record<string, unknown>
   ): Promise<void> {
     try {
       await addDoc(collection(db, 'auditLogs'), {
         timestamp: serverTimestamp(),
         email,
         event,
         detail: detail || {},
       });
     } catch (e) {
       console.warn('Audit log failed (non-blocking):', e);
     }
   }
   ```
4. Add `auditLog()` calls to:
   - `db.ts` → `bookDb()` (book.create / book.update)
   - `db.ts` → `cancelDb()` (book.cancel)
   - `adminDb.ts` → `adminDeleteRegistration()` (admin.delete)
   - `adminDb.ts` → `updateSlot()` (admin.updateSlot)
   - `adminDb.ts` → `updateConfig()` (admin.updateConfig)
5. Add "Audit Log" tab to AdminPanel (read-only list, newest first, paginated)
6. Audit calls are **non-blocking** — must not throw errors that block booking

**Acceptance Criteria:**
- [x] Every book/cancel/admin action creates an audit log entry
- [x] Audit entries are immutable (no update/delete allowed)
- [x] Admin can view audit log in AdminPanel (Audit tab)
- [x] Audit failure does not block the main operation (`void auditLog(...)` + try/catch inside)

**✅ Implemented** (src/lib/audit.ts + calls in db.ts/adminDb.ts + AuditTab in AdminPanel)

---

## Phase 2: Feature Parity (P1) — Est: 3 days

### Task 2.1: Unified Admin Email Source

**Issue:** Issue-05  
**Priority:** 🟡 P1  
**Est:** 2 hours  
**Assignee:** Dev

**Problem:** Admin emails hardcoded in `src/lib/admin.ts` AND `firestore.rules`. Risk of desync.

**Steps:**
1. Move admin email list to Firestore: `/config/main.adminEmails` array field
2. `firestore.rules`: Read admin emails from config doc:
   ```
   function isAdmin() {
     let cfg = get(/databases/$(database)/documents/config/main);
     return request.auth != null
       && request.auth.token.email in cfg.data.adminEmails;
   }
   ```
3. `src/lib/admin.ts`: Read from Firestore on init:
   ```typescript
   let cachedAdminEmails: string[] | null = null;

   export async function getAdminEmails(): Promise<string[]> {
     if (cachedAdminEmails) return cachedAdminEmails;
     const snap = await getDoc(doc(db, 'config', 'main'));
     cachedAdminEmails = snap.data()?.adminEmails ?? [];
     return cachedAdminEmails;
   }

   export async function isAdmin(email: string | null | undefined): Promise<boolean> {
     if (!email) return false;
     const emails = await getAdminEmails();
     return emails.includes(email.toLowerCase());
   }
   ```
4. Update `App.tsx` to use async `isAdmin()`
5. Keep `ADMIN_EMAILS` as fallback for initial load before Firestore responds

**Acceptance Criteria:**
- [x] Admin emails sourced from Firestore (`/config/main.adminEmails`) merged with hardcoded bootstrap list
- [x] Adding admin only requires editing the field in Config tab (or `/config/main.adminEmails` directly)
- [x] Client-side fallback (hardcoded `ADMIN_EMAILS`) works during initial load

**✅ Implemented** (src/lib/admin.ts `fetchAdminEmails()` + firestore.rules `isConfigAdmin()` + Config tab textarea)

---

### Task 2.2: Admin — View "Not Yet Registered" List

**Issue:** UC-2  
**Priority:** 🟡 P1  
**Est:** 3 hours  
**Assignee:** Dev

**Problem:** Admin cannot see who in eligibility list hasn't booked yet.

**Steps:**
1. In `adminDb.ts`, add function:
   ```typescript
   export async function getNotRegistered(): Promise<EligibilityEntry[]> {
     const eligSnap = await getDocs(collection(db, 'eligibility'));
     const regSnap = await getDocs(collection(db, 'registrations'));
     const registeredEmails = new Set(regSnap.docs.map(d => d.id));
     return eligSnap.docs
       .filter(d => !registeredEmails.has(d.id))
       .map(d => ({ email: d.id, ...d.data() }));
   }
   ```
2. Add "Not Registered" tab or section in AdminPanel
3. Show count badge on tab
4. If `/eligibility` is empty → show message "No eligibility list configured"

**Acceptance Criteria:**
- [x] Admin sees list of eligible users who haven't registered (`NotRegisteredTab`)
- [x] Graceful handling when no eligibility list exists ("không có ai" + hint to add)
- [x] Count shown on tab

**✅ Implemented** (`getNotRegistered()` in adminDb.ts + `NotRegisteredTab` in AdminPanel)

---

### Task 2.3: Admin — Slot Management UI (Add/Delete)

**Issue:** UC-7, Issue-08  
**Priority:** 🟡 P1  
**Est:** 4 hours  
**Assignee:** Dev

**Problem:** Admin can only edit capacity/location. Cannot add or delete slots from UI.

**Steps:**
1. Add "Add Slot" button in AdminPanel Slots tab
2. Form fields: type (dropdown), date, session, startMin, endMin, capacity, location
3. Auto-generate `slotId` from convention: `{type_prefix}-{date}-{startTime}` (e.g., `SP-2206-1330`)
4. Add "Delete" button per slot row (with confirmation dialog)
5. Before delete, check if slot has bookings → warn admin "X registrations will be orphaned"
6. Add `adminCreateSlot()` and `adminDeleteSlot()` to `adminDb.ts`
7. Call `auditLog()` for both operations

**Acceptance Criteria:**
- [x] Admin can add new slot from UI (Slots tab → "+ Thêm ca" → `AddSlotForm`)
- [x] Admin can delete slot with confirmation
- [x] Delete warns about affected registrations (`Ca này có N người đã đăng ký...`)
- [x] Both operations are audit-logged (`admin.createSlot` / `admin.deleteSlot`)
- [x] Auto-generate slotId via `generateSlotId(type, date, startMin)` (SP-DDMM-HHMM)

**✅ Implemented** (`adminCreateSlot()`, `adminDeleteSlot()` in adminDb.ts + UI in AdminPanel SlotsTab)

---

### Task 2.4: Admin — Slot Drill-Down (View Registrants)

**Issue:** UC-8  
**Priority:** 🟡 P1  
**Est:** 2 hours  
**Assignee:** Dev

**Problem:** Cannot see who booked into a specific slot.

**Steps:**
1. Add click handler on slot rows in AdminPanel Slots tab
2. Show expandable section below clicked slot with list of registrants
3. Query: filter `/registrations` where `speakingSlotId == slotId` OR `skillsSlotId == slotId`
4. Show: email, empCode, fullName, BU for each registrant

**Acceptance Criteria:**
- [x] Clicking a slot (▸) expands to show list of registrants below it
- [x] Shows registrant count + email/empCode/fullName/BU
- [x] Lazy-loaded (fetches only when first expanded; cached per session)

**✅ Implemented** (`listRegistrationsForSlot()` in adminDb.ts + expand/collapse in SlotsTab)

---

### Task 2.5: Confirmation Email via Firebase Extension

**Issue:** UC-5  
**Priority:** 🟡 P1  
**Est:** 3 hours  
**Assignee:** Dev

**Problem:** No email confirmation after booking (GAS had this).

**Option A — Firestore Email Extension (Recommended):**
1. Install `firebase/extensions/firestore-send-email`
2. Create `/mail/{auto-id}` collection trigger
3. In `db.ts` after successful `bookDb`, write email doc:
   ```typescript
   await addDoc(collection(db, 'mail'), {
     to: email,
     message: {
       subject: 'Xác nhận đăng ký Assessment Q2 2026',
       html: `<p>Xin chào ${fullName},...`,
     },
   });
   ```
4. Mark `config.emailConfirm` as dependency

**Option B — Keep GAS as email sender (simpler):**
1. After bookDb success, call GAS `sendConfirmEmail_` via `google.script.run`
2. Only works if GAS web app is still deployed

**Acceptance Criteria:**
- [x] User receives confirmation email after booking (via Firestore Send-Email extension, **must be installed separately**)
- [x] Email contains slot details (date, time, location) — Vietnamese HTML template
- [x] Email is controlled by `config.emailConfirm` flag (also exposed in Config tab)
- [x] Email failure does not block booking (`sendConfirmationEmail()` has try/catch + `void`)

**✅ Implemented** (`sendConfirmationEmail()` in db.ts writes to `/mail/{id}` after successful tx)

**Setup required:** Install [`firestore-send-email`](https://extensions.dev/extensions/firebase/firestore-send-email) Firebase Extension targeting `mail` collection. Without the extension installed, docs accumulate in `/mail` but no email is actually sent.

---

### Task 2.6: Update README

**Priority:** 🟡 P1  
**Est:** 1 hour  
**Assignee:** Dev

**Steps:**
1. Rewrite README to describe Firebase workflow (not GAS)
2. Add: setup instructions, deployment steps, admin guide
3. Mark GAS code as legacy/deprecated
4. Document Firestore collection structure
5. Add development instructions (`npm run dev` uses mock data)

**Acceptance Criteria:**
- [x] README accurately describes current Firebase architecture
- [x] Setup and deployment instructions are clear
- [x] GAS code marked as deprecated

**✅ Implemented** (full rewrite of README.md with Firestore data model, security matrix, admin guide)

---

## Phase 3: Improvements (P2) — Est: 2 days

### Task 3.1: Add Slot Listeners (Realtime Updates)

**Priority:** 🟢 P2  
**Est:** 3 hours

**Problem:** User in 2 tabs may see stale slot data.

**Steps:**
1. Replace `getDocs` for slots with `onSnapshot` in `initDb`
2. Update slot remaining in real-time
3. Show toast notification when selected slot becomes full
4. Unsubscribe on component unmount

**Acceptance Criteria:**
- [ ] Slot remaining updates in real-time without page refresh
- [ ] No memory leaks (listener unsubscribed on unmount)

---

### Task 3.2: Admin — Bulk Import (CSV Upload)

**Priority:** 🟢 P2  
**Est:** 4 hours

**Steps:**
1. Add CSV upload button in AdminPanel for slots and eligibility
2. Parse CSV, validate data, write to Firestore in batch
3. Show preview before confirming import
4. Handle duplicates (skip or overwrite)

**Acceptance Criteria:**
- [ ] Admin can upload CSV to bulk-create slots
- [ ] Admin can upload CSV to bulk-create eligibility list
- [ ] Preview shown before committing
- [ ] Validation errors shown per row

---

### Task 3.3: Rate Limiting

**Issue:** Issue-07  
**Priority:** 🟢 P2  
**Est:** 3 hours

**Steps:**
1. Add `lastAction` field to registration doc with server timestamp
2. In Firestore rules, reject if `request.time - resource.data.lastAction < 5s`
3. OR implement with Cloud Functions for more sophisticated rate limiting
4. Client-side: disable buttons for 5s after action

**Acceptance Criteria:**
- [ ] User cannot book/cancel more than once per 5 seconds
- [ ] Error message is clear

---

### Task 3.4: Pagination for Admin Registrations

**Issue:** Issue-09  
**Priority:** 🟢 P2  
**Est:** 2 hours

**Steps:**
1. Use Firestore `limit()` and `startAfter()` for pagination
2. Add "Load more" button or infinite scroll in AdminPanel
3. Default page size: 50

**Acceptance Criteria:**
- [ ] Registrations load in pages of 50
- [ ] "Load more" fetches next page
- [ ] Total count still accurate

---

### Task 3.5: Guard Against Orphan Registrations

**Issue:** EC-1  
**Priority:** 🟢 P2  
**Est:** 2 hours

**Steps:**
1. When admin deletes a slot, check for registrations using it
2. If found, either: (a) prevent deletion, or (b) show list of affected users and ask for confirmation
3. If deletion proceeds, mark orphaned registrations with warning flag
4. AdminPanel shows orphaned registrations with red warning

**Acceptance Criteria:**
- [x] Admin is warned before deleting a slot with registrations (`Ca này có N người...` confirm)
- [x] Orphaned registrations are clearly flagged in admin view (red `(đã xoá)` label)
- [ ] (Not done) Set a `warningFlag` on orphan registration docs

**✅ Partially implemented** — Warning before deletion + visual flag in registrations table. Did not add a persistent `warningFlag` field on docs (low value).

---

### Task 3.6: Fix `initDb('')` in AdminPanel

**Issue:** Issue-10  
**Priority:** 🟢 P2  
**Est:** 15 minutes

**Steps:**
1. Change `AdminPanel.tsx` line 24 from:
   ```typescript
   Promise.all([initDb(''), listRegistrations()])
   ```
   to:
   ```typescript
   listRegistrations()
   ```
2. AdminPanel doesn't need initDb — it only needs slot list for formatting. Fetch slots separately or pass from parent.

**Acceptance Criteria:**
- [x] No wasted query to empty registration key
- [x] AdminPanel still shows slot data correctly

**✅ Implemented** (AdminPanel uses `listSlots()` + `loadConfig()` directly instead of `initDb('')`)

---

## Implementation Order & Timeline

```
Week 1 (Security):
├── Day 1-2: Task 1.1 (Firestore rules) + Task 1.2 (Deadline server-side)
├── Day 3:   Task 1.3 (Eligibility) + Task 1.4 (Audit log)
└── Day 4:   Testing all P0 items + deploy

Week 2 (Features):
├── Day 1:   Task 2.1 (Admin emails) + Task 2.2 (Not-registered list)
├── Day 2:   Task 2.3 (Slot add/delete) + Task 2.4 (Slot drill-down)
├── Day 3:   Task 2.5 (Email confirmation) + Task 2.6 (README)
└── Day 4:   Testing all P1 items + deploy

Week 3+ (Backlog):
├── Task 3.1 (Realtime listeners)
├── Task 3.2 (Bulk import)
├── Task 3.3 (Rate limiting)
├── Task 3.4 (Pagination)
├── Task 3.5 (Orphan guard)
└── Task 3.6 (Fix initDb)
```

---

## Testing Checklist

### Security Tests
- [ ] Non-admin user cannot write to `/slots/*` via SDK
- [ ] User cannot book past deadline (even with changed system clock)
- [ ] Non-eligible user cannot book when eligibility list exists
- [ ] All actions are audit-logged

### Functional Tests
- [ ] New booking creates registration + decrements remaining
- [ ] Change booking increments old slot remaining, decrements new slot
- [ ] Cancel booking restores remaining
- [ ] Admin delete restores remaining
- [ ] Race condition: 2 users booking last slot → only 1 succeeds
- [ ] Email confirmation sent (if enabled)
- [ ] Admin can view "not yet registered" list
- [ ] Admin can add/delete slots from UI
- [ ] Admin can view registrants per slot

### Regression Tests
- [ ] Existing booking flow still works
- [ ] Admin panel all tabs functional
- [ ] CSV export still works
- [ ] Mobile responsive
- [ ] Error boundary catches and displays errors

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Firestore rules changes break existing functionality | Medium | High | Test thoroughly in Firebase emulator before deploy |
| Eligibility collection blocks legitimate users | Low | High | Make it backward-compatible (empty collection = no restriction) |
| Email extension setup complexity | Medium | Low | Fall back to GAS email sender if needed |
| Audit log increases Firestore costs | Low | Low | Use TTL or archive old logs |
| Admin email source change breaks admin access | Low | High | Keep hardcoded fallback during transition |

---

## Files to Modify

| File | Changes |
|------|---------|
| `firestore.rules` | P0: Restrict slot writes, add deadline check, add eligibility check, add audit rules |
| `src/lib/db.ts` | P0: Add eligibility check, add audit calls, add deadline comment |
| `src/lib/audit.ts` | P0: New file — audit logging utility |
| `src/lib/adminDb.ts` | P0: Add audit calls; P1: Add slot CRUD, not-registered query |
| `src/lib/admin.ts` | P1: Read admin emails from Firestore |
| `src/App.tsx` | P1: Update admin check to async |
| `src/AdminPanel.tsx` | P1: Add tabs for audit log, not-registered, slot management; P2: pagination |
| `README.md` | P1: Rewrite for Firebase workflow |
| `package.json` | P1: Add firestore-send-email extension config |

---

## Post-Verification Fixes (round 2)

Verification of the initial implementation surfaced 4 minor issues. All fixed:

### Issue 1 — Stale admin cache on first load ✅
**Symptom:** `isAdmin()` is sync but `fetchAdminEmails()` is async. On first render the cache only had the hardcoded fallback, so Firestore-only admins (added via Config tab) were not recognized until a re-render.

**Fix:** `App.tsx` now awaits `fetchAdminEmails()` inside the `onAuth` callback BEFORE calling `setUser(...)`, so by the time the user is treated as ready, the admin cache is fully populated. Removed the redundant fetch + `adminTick` ping in `AppInner`.

**Files:** `src/App.tsx`

### Issue 2 — Eligibility empty-collection fallback ✅
**Symptom:** If `config.requireEligibility=true` but the `/eligibility` collection is empty (admin enabled flag before populating), the client-side check blocked everyone with a confusing error.

**Fix:** `checkEligibility()` in `db.ts` now probes the collection with `getDocs(query(collection(db, 'eligibility'), limit(1)))`; if empty, returns `null` (treat as no restriction). Added clear inline comment that Firestore rules still enforce strictly — admin must populate before toggling the flag.

**Files:** `src/lib/db.ts`

### Issue 3 — Strict slot field validation on admin updates ✅
**Symptom:** Admin update path in `firestore.rules` only validated `remaining`. An admin could PATCH a slot with `type="hacked"`, negative `capacity`, or `endMin <= startMin`.

**Fix:** Added `validNewSlot()` and `validAdminSlotUpdate()` helpers in `firestore.rules`. Per-field guards activate only when that field is in `diff().affectedKeys()`, so a location-only edit doesn't have to revalidate everything. Booking path (`onlyRemainingChanged()`) untouched.

**Files:** `firestore.rules`

### Issue 4 — README Admin Setup section ✅
**Fix:** Added a dedicated **Admin Setup** section in README covering:
- Admin emails (hardcoded + Firestore + fallback rules)
- Eligibility setup (with explicit warning about populate-before-enable ordering)
- Deadline & enrollment toggles
- Bulk import scripts
- Email extension setup

**Files:** `README.md`