# Deployment Guide

## Preflight

1. Install dependencies with `npm install`.
2. Run `npm run check`.
3. Confirm Firebase project environment variables:
   - `FUNCTIONS_ENFORCE_APP_CHECK=true` to enforce App Check on callable functions.
   - `FUNCTIONS_USER_RATE_LIMIT_MS=3000` or another positive millisecond value for user action throttling.
   - `VITE_APPCHECK_RECAPTCHA_V3_SITE_KEY` for frontend App Check token generation.

## Deploy Firestore Rules

Deploy `firestore.rules` before or with the application release so server-owned collections remain protected:

```bash
firebase deploy --only firestore:rules
```

## Deploy Cloud Functions

Deploy callable and scheduled functions after verifying environment configuration:

```bash
firebase deploy --only functions
```

Required server-side functions include booking, cancellation, claim repair, redundant registration email cleanup, and stale rate-limit cleanup.

## Deploy Frontend

Build and deploy hosting:

```bash
npm run build
firebase deploy --only hosting
```

## Post-Deploy Checks

- Book a test registration with a default BU such as `BSG`.
- Cancel the test registration and confirm seats and empCode claims are restored.
- Verify rapid repeated book or cancel attempts return a rate-limit error.
- Confirm admin CSV export works for selected rows and all rows.
- Confirm the admin cleanup action removes redundant `email` fields from registration documents.
