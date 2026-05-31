# Project Roadmap

## Current Baseline

The booking money-path is owned by Cloud Functions: capacity, overlap, quota, empCode locks, rate limits, and registration writes are enforced server-side. Firestore rules prevent direct client writes to server-owned collections and allow users to read only their own registration.

## Near Term

- Keep test coverage around booking, cancellation, rate limits, and Firestore rules green.
- Finish small maintainability cleanup as audit findings appear.
- Keep documentation aligned with deployment, security, and admin workflows.

## Later

- Consider calendar component refinements if slot volume grows.
- Add richer admin observability for maintenance jobs and failed email delivery.
- Review bundle size if Firebase SDK usage expands beyond the current app shape.

## Operational Notes

- Do not deploy directly from audit cleanup work without a separate release decision.
- Run the full check suite before release: typecheck, unit tests, rules tests, functions syntax check, and build.
- Keep Cloud Function environment variables documented in `docs/deployment-guide.md`.
