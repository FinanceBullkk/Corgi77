# System Architecture

## Overview

Corgi7 is a Firebase-backed assessment booking app. The frontend is a Vite/React application, while privileged booking mutations run through Firebase Cloud Functions and Firestore transactions.

Primary data stores:

- `config/main`: enrollment switches, deadline, admin emails, and change limits.
- `slots/{slotId}`: speaking and 3-skills assessment slots with capacity and remaining seats.
- `registrations/{email}`: one booking document per user email.
- `empCodeClaims/{empCode}`: optimistic ownership lock that prevents one employee code from being reused.
- `ineligibility/{empCode}` and optional `eligibility/{empCode}`: blocklist/allowlist controls.
- `auditLogs/{id}`: immutable operational audit trail.

## Runtime Boundaries

The browser reads config, slots, and the current user's registration via `src/lib/db.ts`. It calls Cloud Functions for booking and cancellation so that capacity changes, registration writes, and employee-code claims stay in a single transaction.

Admin screens use `src/lib/adminDb.ts` for privileged operations. Firestore rules allow these operations only for emails listed in `config/main.adminEmails`; audit entries are appended after admin actions on a best-effort basis.

Cloud Functions in `functions/index.js` own the highest-risk writes:

- `bookRegistration`: validates profile data, deadline/config, slot capacity, duplicate employee-code claims, overlap, and max change count.
- `cancelRegistration`: deletes the registration, restores slot capacity, and releases the employee-code claim.
- `adminBackfillEmpCodeClaims` and scheduled repair: rebuild or repair claim documents from registrations.

## Security Model

Firestore rules are the final enforcement layer. They protect:

- deadline and enrollment gates using `request.time`.
- authenticated user ownership for normal registration reads/writes.
- admin-only slot/config/ineligibility/audit operations.
- slot capacity invariants such as positive capacity and non-negative remaining seats.

Client-side checks exist for faster feedback and defense in depth, but they are not trusted as the source of truth.

## Consistency Model

Booking mutations use Firestore transactions with read-before-write ordering. Slot documents are read before capacity updates, registration documents are read before replacement/cancel logic, and `empCodeClaims` acts as an optimistic lock for employee-code uniqueness.

The system treats confirmation email as a queued side effect. A successful booking can remain valid even if the email enqueue step fails.

## Observability

Frontend errors flow through `src/lib/monitoring.ts`, which reports to Sentry when `VITE_SENTRY_DSN` is configured and falls back to console warnings in local/dev environments. Audit-log write failures are non-blocking but are also reported through the same monitoring path.
