# Codebase Summary

## Frontend

- `src/App.tsx` coordinates the user booking flow.
- `src/booking/` contains the booking form, calendar step, slot cards, confirmation modal, and success/current-booking display.
- `src/AdminPanel.tsx` and `src/admin/` contain the admin shell, tabs, drawers, and admin-only UI helpers.
- `src/lib/db.ts` is the normal user data boundary.
- `src/lib/adminDb.ts` is the admin data boundary.
- `src/lib/types.ts` contains shared TypeScript types and small formatting helpers.
- `src/lib/slot-helpers.ts` maps Firestore slot documents to the app `Slot` shape.
- `src/lib/audit.ts` appends and lists audit log entries.
- `src/lib/monitoring.ts` initializes Sentry and normalizes local fallback logging.

## Backend And Rules

- `functions/index.js` contains callable Cloud Functions and scheduled maintenance for registration integrity.
- `firestore.rules` enforces user ownership, admin access, deadline/config gates, slot invariants, and audit log immutability.
- `firebase.json` wires hosting, functions, Firestore rules, and emulator ports.

## Tests

- `src/__tests__/db.test.ts`: user data flow unit tests.
- `src/__tests__/adminDb.test.ts`: admin data operation unit tests.
- `src/__tests__/functions-booking.test.ts`: Cloud Functions booking/cancel behavior.
- `src/__tests__/security.test.ts`: security-oriented unit coverage for abuse cases.
- `src/__tests__/firestore-rules.emulator.test.ts`: Firestore rules coverage against the emulator.
- `src/__tests__/booking-navigation.test.tsx`: booking UI navigation behavior.

Run the main checks with:

```bash
npm test
npm run typecheck
```

If the emulator suite is needed, use the project's Firebase emulator command from `package.json`.
