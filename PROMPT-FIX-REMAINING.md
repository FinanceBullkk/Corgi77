# Prompt: Fix Remaining Issues After Corgi7 Verification

> Copy everything below the line and paste into a new Cline/AI session.

---

You are working on the **Corgi7** project at `/Users/hao/Documents/GitHub/Corgi7`. A previous implementation round addressed all P0/P1/P2 items. Verification found **4 remaining issues** that need to be fixed. All are low-to-medium severity but should be resolved before production deployment.

## Context

Read these files first to understand current state:
- `src/lib/admin.ts` — admin email logic
- `src/lib/db.ts` — booking/cancel logic
- `src/App.tsx` — main app component
- `src/AdminPanel.tsx` — admin dashboard
- `firestore.rules` — Firestore security rules
- `README.md` — project documentation

---

## Issue 1: `isAdmin()` Sync Cache May Be Stale on App Load

### Problem
`src/lib/admin.ts` exports `isAdmin(user)` as a synchronous function that reads from `_adminCache`. This cache is populated by `refreshAdminCache()` (async). If `refreshAdminCache()` hasn't been called yet when `isAdmin()` is first invoked, it falls back to the hardcoded `ADMIN_EMAILS` array. This means:
- On first page load, the admin check uses the hardcoded list (not Firestore config)
- If admin emails are updated in Firestore, they won't be used until cache is refreshed
- Race condition: if `refreshAdminCache()` is slow, the first check may use stale data

### Fix Required in `src/App.tsx`
In the `useEffect` where you check if the current user is admin, ensure `refreshAdminCache()` is **awaited** before calling `isAdmin()`:

```tsx
// In App.tsx useEffect
import { refreshAdminCache, isAdmin } from './lib/admin';

// ...

useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (user) {
      await refreshAdminCache();  // ← MUST await this first
      const admin = isAdmin(user);
      setCurrentUser(user);
      setIsAdminUser(admin);
    } else {
      setCurrentUser(null);
      setIsAdminUser(false);
    }
    setLoading(false);
  });
  return unsubscribe;
}, []);
```

### Acceptance Criteria
- [ ] `refreshAdminCache()` is called and awaited before `isAdmin()` in App.tsx
- [ ] No flash of incorrect admin state on first load
- [ ] If user is admin in Firestore config but NOT in hardcoded list, they still get admin access after cache loads

---

## Issue 2: Eligibility Backward Compatibility — Collection-Level Fallback Missing

### Problem
In `src/lib/db.ts`, the eligibility check is config-gated (`requireEligibility` flag). This is good. However, if `requireEligibility` is `true` but the `/eligibility` collection is empty (or doesn't exist), ALL users are blocked from booking. There's no fallback for "collection exists but is empty" scenario.

### Fix Required in `src/lib/db.ts`
In the `checkEligibility()` function, add a safeguard: if the eligibility collection exists but has zero documents, treat it as "no eligibility system configured" and allow all users:

```ts
async function checkEligibility(email: string): Promise<string | null> {
  const cfg = await getConfig();
  if (!cfg.requireEligibility) return null;

  // Check if ANY eligibility documents exist at all
  const eligibilityCol = collection(db, 'eligibility');
  const allDocs = await getDocs(query(eligibilityCol, limit(1)));
  
  // If no eligibility docs exist, allow all (backward-compatible)
  if (allDocs.empty) return null;

  // Check specific user eligibility
  const userDoc = await getDoc(doc(db, 'eligibility', email));
  if (!userDoc.exists()) {
    return 'Bạn không nằm trong danh sách đủ điều kiện đăng ký.';
  }
  return null;
}
```

Note: You'll need to add `limit` to the firebase/firestore imports.

### Acceptance Criteria
- [ ] If `requireEligibility=true` but `/eligibility` collection is empty → users can still book
- [ ] If `requireEligibility=true` and `/eligibility` has at least 1 doc → only eligible users can book
- [ ] If `requireEligibility=false` → all users can book (existing behavior, unchanged)
- [ ] Firestore rules `isEligible()` still works independently (rules check `exists(/databases/$(database)/documents/eligibility/$(email))`)

---

## Issue 3: Admin Slot Update Missing Full Field Validation

### Problem
In `firestore.rules`, when an admin updates a slot (lines 77-80), only `remaining` is validated. If admin changes `type`, `capacity`, `date`, `startMin`, `endMin`, or `location`, those values are NOT validated. This could allow:
- Invalid slot type (e.g., type = "hacked")
- Zero or negative capacity
- Negative times

### Fix Required in `firestore.rules`
Add comprehensive validation to the admin slot update path:

```javascript
// In the slots/{slotId} section, update the admin update rule:
allow update: if isAdmin()
  && (
    !request.resource.data.diff(resource.data).affectedKeys().hasAny(['type', 'capacity', 'date', 'startMin', 'endMin'])
    || (
      (!request.resource.data.diff(resource.data).affectedKeys().has('type') || request.resource.data.type in ['Speaking', '3 Skills'])
      && (!request.resource.data.diff(resource.data).affectedKeys().has('capacity') || (request.resource.data.capacity is int && request.resource.data.capacity > 0))
      && (!request.resource.data.diff(resource.data).affectedKeys().has('startMin') || (request.resource.data.startMin is int && request.resource.data.startMin >= 0))
      && (!request.resource.data.diff(resource.data).affectedKeys().has('endMin') || (request.resource.data.endMin is int && request.resource.data.endMin > request.resource.data.startMin))
    )
  )
  && request.resource.data.remaining is int
  && request.resource.data.remaining >= 0
  && request.resource.data.remaining <= request.resource.data.capacity;
```

### Acceptance Criteria
- [ ] Admin cannot set slot type to anything other than 'Speaking' or '3 Skills'
- [ ] Admin cannot set capacity to 0 or negative
- [ ] Admin cannot set endMin <= startMin
- [ ] Admin can still update location, session, display without restrictions
- [ ] Non-admin booking transaction (decrement remaining) still works — this rule only applies to admin updates

---

## Issue 4: README Should Document Eligibility Import Process

### Problem
`README.md` now describes Firebase workflow and marks GAS as deprecated. However, it doesn't document:
1. How to import eligibility data into Firestore
2. The requirement to populate `/eligibility` collection BEFORE enabling `requireEligibility` flag
3. How to add admin emails to Firestore config

### Fix Required in `README.md`
Add a section "Admin Setup" that covers:

```markdown
## Admin Setup

### 1. Configure Admin Emails
Admin access is determined by emails stored in Firestore at `/config/main`. 

Set the `adminEmails` field to an array of email strings:
```
/config/main → { adminEmails: ["admin1@company.com", "admin2@company.com"] }
```

If the Firestore config is unavailable, the app falls back to the hardcoded list in `src/lib/admin.ts`.

### 2. Enable Eligibility Checking (Optional)
To restrict booking to specific users:

1. Create `/eligibility` collection in Firestore
2. Add a document per eligible user: doc ID = email, fields: `{ empCode, fullName, bu }`
3. Set `/config/main.requireEligibility = true`

⚠️ **Important**: If `requireEligibility` is `true` but the `/eligibility` collection is empty, all users are allowed (backward-compatible). Once you add at least one eligibility document, only listed users can book.

### 3. Set Enrollment Deadline
Set `/config/main.deadline` as a Firestore Timestamp.
Set `/config/main.allowEnrollment = true` to open booking.

### 4. Bulk Import (CSV)
Use the provided scripts:
- `scripts/seed-firestore.mjs` — import Slots and Config from CSV
- Sheet templates in `sheet-templates/` — reference CSV formats
```

### Acceptance Criteria
- [ ] README has "Admin Setup" section
- [ ] Eligibility import process is documented
- [ ] `requireEligibility` backward-compat behavior is documented
- [ ] Admin email configuration is documented
- [ ] GAS code is clearly marked as deprecated with migration notes

---

## Execution Rules

1. Fix all 4 issues in order (1 → 2 → 3 → 4)
2. After each fix, verify the logic by reading the modified file
3. Do NOT introduce new dependencies (except `limit` from firebase/firestore for Issue 2)
4. Do NOT break existing functionality
5. After all fixes, update the verification checklist in `IMPLEMENTATION-PLAN.md`

## Success Criteria

All 4 minor issues resolved. No new issues introduced. Ready for production deployment.