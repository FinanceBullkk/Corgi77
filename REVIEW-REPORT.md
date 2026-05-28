# Corgi7 — Assessment Booking Q2 2026: Audit Report

> **Date:** 28/05/2026  
> **Reviewer:** AI Code Review  
> **Commit:** `c239e5e`  
> **Scope:** Full codebase review — security, architecture, feature completeness, edge cases

---

## 1. Project Overview

**Purpose:** Slot booking system for employee Assessment exams (Speaking + 3 Skills) at Cyberlogitec.

**Tech Stack:**
| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Auth | Firebase Auth (Google OAuth) |
| Database | Firestore |
| Hosting | Firebase Hosting |
| Legacy | Google Apps Script + Sheets (not deployed) |

**Architecture:**
```
┌──────────────────┐      ┌───────────────────┐      ┌──────────────────┐
│   React SPA      │─────▶│  Firebase Auth     │      │  Google Sheets   │
│  (Vite + TS)     │      │  (Google OAuth)    │      │  (Legacy GAS)    │
│                  │─────▶│  Firestore DB      │      │  gas/Code.js     │
│  Firebase Host   │      │  (Production)      │      │  (Not deployed)  │
└──────────────────┘      └───────────────────┘      └──────────────────┘
```

**Note:** The README describes GAS workflow, but `package.json` uses `firebase deploy`. This is a documentation mismatch.

---

## 2. Current Workflow

### 2.1 User Flow
1. Access Firebase Hosting URL
2. Sign in with Google (Firebase Auth popup)
3. Domain check → `@cyberlogitec.com` only
4. `initDb()` → fetch slots, config, existing booking
5. If not registered:
   - Step 1: Enter profile (Employee Code 6 digits, Full Name, BU)
   - Step 2: Select 1 Speaking slot + 1 Skills slot (no time overlap)
   - Confirm → `bookDb()` via Firestore transaction
6. If already registered:
   - View booking summary
   - Change slots (limited by `maxChanges`)
   - Cancel registration

### 2.2 Admin Flow
1. Sign in with hardcoded admin email
2. Admin Panel with 4 tabs:
   - **Overview:** Total stats (registered, slots remaining)
   - **Registrations:** Search, CSV export, delete (restores slot remaining)
   - **Slots:** Edit capacity / location
   - **Config:** Toggle enrollment, set deadline, max changes

### 2.3 Data Model (Firestore)
```
/config/main
  ├── deadline: Timestamp
  ├── allowEnrollment: boolean
  ├── maxChanges: number
  └── emailConfirm: boolean

/slots/{slotId}
  ├── type: "Speaking" | "3 Skills"
  ├── date: "YYYY-MM-DD"
  ├── session: "AM" | "PM"
  ├── startMin: number
  ├── endMin: number
  ├── capacity: number
  ├── remaining: number
  └── location: string

/registrations/{email}
  ├── empCode: string
  ├── fullName: string
  ├── bu: string
  ├── speakingSlotId: string
  ├── skillsSlotId: string
  ├── createdAt: Timestamp
  ├── updatedAt: Timestamp
  └── changeCount: number
```

---

## 3. Acceptance Criteria

### 3.1 Authentication & Authorization

| # | Criteria | Status | Notes |
|---|----------|--------|-------|
| AC-1 | Only `@cyberlogitec.com` email can access | ✅ | Client-side check only |
| AC-2 | Admin restricted to specified emails | ⚠️ | Hardcoded in 2 places, can desync |
| AC-3 | Firestore rules block user from modifying others' data | ✅ | Registrations rules OK |
| AC-4 | Firestore rules block non-admin config writes | ✅ | `isAdmin()` check |

### 3.2 Booking

| # | Criteria | Status | Notes |
|---|----------|--------|-------|
| AC-5 | User selects 1 Speaking + 1 Skills, no time overlap | ✅ | Client + server check |
| AC-6 | Full slots rejected | ✅ | Client-side in transaction |
| AC-7 | Past deadline blocks booking/cancel | ⚠️ | Uses client time — can be bypassed |
| AC-8 | `allowEnrollment=false` blocks new bookings | ✅ | |
| AC-9 | Race condition: 2 users booking last slot → only 1 succeeds | ✅ | Firestore transaction |
| AC-10 | Change count limited to `maxChanges` | ✅ | |

### 3.3 Admin

| # | Criteria | Status | Notes |
|---|----------|--------|-------|
| AC-11 | Admin views all registrations | ✅ | |
| AC-12 | Admin deletes registration, slot remaining restored | ✅ | |
| AC-13 | Admin edits slot capacity/location | ✅ | |
| AC-14 | Admin exports CSV | ✅ | |
| AC-15 | Admin views statistics | ✅ | Overview tab |

### 3.4 Data Integrity

| # | Criteria | Status | Notes |
|---|----------|--------|-------|
| AC-16 | Audit log for all actions | ❌ | Not in Firebase path |
| AC-17 | Confirmation email after booking | ❌ | Not in Firebase path |
| AC-18 | Data lint/sanity check | ❌ | Not in Firebase path |
| AC-19 | Eligibility check (restricted participant list) | ❌ | Not in Firebase path |

---

## 4. Strengths ✅

| # | Strength | Detail |
|---|----------|--------|
| S-1 | **Transaction handling** | `db.ts` follows "all reads before all writes" pattern correctly |
| S-2 | **UX flow** | 2-step wizard is intuitive; slot grid is visual |
| S-3 | **Deadline countdown** | Auto-refreshes every 30s; pill UI with color states |
| S-4 | **Error handling** | ErrorBoundary, banner notifications, retry on load error |
| S-5 | **Overlap detection** | Both client-side and server-side |
| S-6 | **Responsive** | Mobile breakpoint at 600px |
| S-7 | **Dev mock data** | `mockData.ts` allows local development without Firebase |
| S-8 | **Admin panel** | Complete CRUD with search, CSV export |

---

## 5. Issues Found

### 🔴 P0 — Critical (Security)

#### Issue-01: Firestore Rules Too Permissive on Slots

**File:** `firestore.rules` lines 15–18  
**Severity:** CRITICAL

```javascript
match /slots/{slotId} {
  allow read: if request.auth != null;
  allow write: if request.auth != null;  // ← ANY signed-in user can write!
}
```

**Impact:** Any authenticated user can:
- Modify `capacity` and `remaining` of any slot
- Create fake slots
- Delete real slots
- Bypass booking logic entirely

**Fix:** Restrict writes to admin only.

---

#### Issue-02: Deadline Check Uses Client Time

**File:** `src/lib/db.ts` line 112  
**Severity:** CRITICAL

```typescript
if (cfg.deadline && new Date() > (cfg.deadline as Timestamp).toDate())
```

`new Date()` is **client machine time**. Users can:
- Change system clock to before deadline → still book
- Use browser DevTools to override `Date` constructor

**Fix:** Use Firestore Security Rules with `request.time` or Cloud Functions.

---

#### Issue-03: No Eligibility Check in Firebase

**Severity:** HIGH  
**Detail:** GAS code has `readEligibility_()` to restrict who can register. Firebase path has **no eligibility collection or check**. Any `@cyberlogitec.com` user can book.

---

#### Issue-04: No Audit Log in Firebase

**Severity:** HIGH  
**Detail:** GAS logs every action to `AuditLog` sheet. Firebase path **logs nothing**. No way to trace who did what and when.

---

### 🟡 P1 — Medium

#### Issue-05: Admin List Hardcoded in 2 Places (Desync Risk)

**Files:** `src/lib/admin.ts`, `firestore.rules`  
**Severity:** MEDIUM

Admin emails are defined in both `admin.ts` (client) and `firestore.rules` (server). If added in one but not the other:
- UI shows Admin button → Firestore rejects writes (or vice versa)

**Fix:** Single source of truth. Use Firestore `config/adminEmails` doc, or Cloud Functions custom claims.

---

#### Issue-06: Cancel Doesn't Check `allowEnrollment`

**File:** `src/lib/db.ts` `cancelDb()`  
**Severity:** LOW-MEDIUM

When admin locks enrollment, users can still cancel. May or may not be intentional.

---

#### Issue-07: No Rate Limiting

**Severity:** MEDIUM

No frequency limits on API calls. Users can spam book/cancel repeatedly, potentially exhausting Firestore quota.

---

#### Issue-08: No Slot Management UI

**Severity:** MEDIUM

AdminPanel comment says "go to Firestore Console" to add/delete slots. Significant UX gap for non-technical admins.

---

#### Issue-09: No Pagination for Admin Registrations

**Severity:** LOW

`listRegistrations()` fetches ALL documents. Could be slow with hundreds of registrations.

---

### 🟢 P2 — Low

#### Issue-10: `initDb('')` in AdminPanel

**File:** `src/AdminPanel.tsx` line 24  
**Severity:** LOW

Calls `initDb('')` → queries `registrations/` (empty key). Wasteful but not breaking.

---

#### Issue-11: Firebase Config Hardcoded

**File:** `src/lib/firebase.ts`  
**Severity:** LOW

API key in source. Not a security risk by itself (Firebase keys are public by design), but combined with loose rules → problematic.

---

## 6. Uncovered Use Cases

### 6.1 Functional Gaps

| # | Use Case | Description |
|---|----------|-------------|
| UC-1 | **Eligibility management** | Admin cannot manage restricted participant list on Firebase |
| UC-2 | **"Not yet registered" list** | Admin cannot see who in eligibility list hasn't booked |
| UC-3 | **Bulk import slots** | Must create slots one-by-one in Firestore Console |
| UC-4 | **Bulk import eligibility** | No import mechanism |
| UC-5 | **Email notifications** | No confirmation email, no reminders |
| UC-6 | **Audit trail** | No history of actions |
| UC-7 | **Add/delete slots from UI** | Only capacity/location editable |
| UC-8 | **Slot drill-down** | Cannot see who booked into specific slot |
| UC-9 | **Transfer booking between users** | Admin cannot reassign |
| UC-10 | **Waitlist** | No mechanism when slot is full |

### 6.2 Edge Cases Not Handled

| # | Edge Case | Current Behavior |
|---|-----------|-----------------|
| EC-1 | Admin deletes a slot that has bookings | Booking becomes orphan; UI shows "deleted" but reg still exists |
| EC-2 | User changes Google account email | Booking loses association |
| EC-3 | Admin reduces capacity below current bookings | Client-side blocked in UI, but Firestore rules allow direct write |
| EC-4 | Two admins editing same config/deleting same reg | No conflict resolution |
| EC-5 | User has 2 browser tabs open | No realtime listener (onSnapshot); stale data possible |
| EC-6 | Network failure mid-transaction | Firestore auto-retries, but `remaining` could be wrong if doc was deleted |
| EC-7 | `remaining` goes negative (admin manual edit or race) | No validation in Firestore rules |

### 6.3 Security Edge Cases

| # | Scenario | Risk Level |
|---|----------|-----------|
| SEC-1 | User uses Firebase SDK directly (bypasses UI) | HIGH — can modify slots, read all registrations |
| SEC-2 | User changes system clock to bypass deadline | HIGH — deadline becomes meaningless |
| SEC-3 | Admin account compromised | HIGH — full control, no 2FA enforcement |
| SEC-4 | User sends rapid-fire requests | MEDIUM — no rate limiting |

---

## 7. Score Summary

| Dimension | Score | Notes |
|-----------|-------|-------|
| Architecture | 7/10 | Clean but dual-backend causes confusion |
| Security | 4/10 | Loose rules, client-side deadline, no audit |
| Feature Completeness | 5/10 | Missing eligibility, audit, email vs GAS |
| Code Quality | 8/10 | Clean TypeScript, good transaction handling |
| UX/UI | 8/10 | Good wizard flow, responsive, error handling |
| Developer Experience | 7/10 | Good mock data, but outdated README |
| **Overall** | **6/10** | Functional for small scale, but security holes and feature gaps need addressing before production launch |

---

## 8. Conclusion

The system is **functional but not secure**. Code quality and UX are good, but the security model has serious gaps (Firestore rules, client-side deadline) and many features from the GAS version are missing in the Firebase path. **P0 items must be fixed before opening registration.**