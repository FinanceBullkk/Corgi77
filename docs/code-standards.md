# Code Standards

## General

- Prefer small modules with clear ownership. Keep UI orchestration, data access, and Cloud Function business rules separated.
- Reuse existing helpers before adding new abstractions. Shared booking slot formatting and parsing logic belongs in `src/lib/slot-helpers.ts`.
- Keep user-facing Vietnamese messages consistent and actionable.
- Do not store duplicate user email fields inside registration documents. The registration document id is the canonical email.

## Frontend

- Call booking and cancellation through Firebase callable functions. Do not reintroduce client-side booking transactions for capacity, quota, or ownership decisions.
- Use path-keyed Firestore mocks in tests. Avoid `mockResolvedValueOnce` chains for reads whose order can change during refactors.
- Keep admin export paths paginated when reading broad collections.
- Validate obvious admin input client-side, but rely on Firestore rules and Cloud Functions as the final enforcement layer.

## Cloud Functions

- Enforce authentication inside every callable handler with `assertSignedIn` or `assertAdmin`.
- Keep booking and cancellation rate limits server-side using `functionRateLimits`.
- Configure runtime-sensitive values via environment variables when possible. `FUNCTIONS_USER_RATE_LIMIT_MS` controls the default user action throttle.
- Write operational maintenance jobs in batches when touching many documents.
- Audit privileged actions with `addAudit`, and keep audit event names listed in `src/lib/audit.ts` and `firestore.rules` in sync.

## Firestore Rules

- Add explicit deny rules for internal server-owned collections, including `functionRateLimits`.
- Keep client-created audit logs restricted to admins and their own authenticated email.
- Treat rules as defense in depth. Business-critical checks should also live in Cloud Functions.

## Tests

- Add focused tests for each security or data-shape regression.
- Prefer path-based mock helpers for Firestore reads.
- Run `npm run check` before handing off changes.
