# BrandWeave configuration fixes

This update keeps the intended architecture:
- Firebase Authentication for Google and email/password sign-in.
- Firebase Admin on the server to verify Firebase ID tokens.
- Supabase REST/Postgres for application records.
- Supabase Storage for uploaded files.
- No Firestore or Firebase Storage dependency.

## What changed

1. Firebase Web App configuration is checked separately from Firebase Admin credentials.
2. `/api/health` now reports `firebaseWeb`, `firebaseAdmin`, `firebaseAuth`, `firebaseStatus`, `firebaseMessage`, and `missingFirebaseWebFields`.
3. `/api/config` returns the five public Firebase Web App fields and safe diagnostics; it never returns Admin secrets.
4. The server accepts standard service-account JSON and JSON-encoded service-account strings, normalizes escaped key newlines, validates required fields and private-key PEM syntax, and checks that the service-account project matches `FIREBASE_PROJECT_ID`.
5. The frontend shows the real setup reason instead of the old generic Google sign-in error.
6. Fixed the frontend health check to read `health.firebaseAuth`.
7. Added missing Supabase variables to `.env.example` and expanded deployment troubleshooting documentation.

## After replacing the GitHub project files

1. Push the updated files to the connected GitHub repository.
2. In Vercel, confirm the six Firebase environment variables are present for **Production**. `FIREBASE_SERVICE_ACCOUNT_JSON` must contain the complete JSON file contents.
3. Redeploy the latest commit.
4. Open `/api/health` on the deployed domain and follow `firebaseStatus` / `firebaseMessage` if `firebaseAuth` is still false.

Never commit `.env`, a service-account JSON file, or Supabase secret keys.


## Vercel API routing fix

The root `index.js` now creates an Express application directly and mounts the existing BrandWeave server app. This makes the root entrypoint follow Vercel's Express detection contract. The backend already defines `/api/config` and `/api/health`; a 404 for those paths indicates the deployment was not routing requests to the Express app. After deploying this update, confirm the Vercel Root Directory is `./` and allow Express framework detection.


## Google sign-in fix (auth/popup-closed-by-user) and auth hardening

**Root cause.** Helmet 8 sends `Cross-Origin-Opener-Policy: same-origin` by default. That header cuts the link between
the BrandWeave page and the Google sign-in popup, so Firebase immediately sees the popup as "closed" and reports
`auth/popup-closed-by-user` even though the user never closed it. The earlier CSP change was needed (it removed
`auth/internal-error`) but was a different problem. `server/index.js` now sends
`Cross-Origin-Opener-Policy: same-origin-allow-popups`.

**Other fixes**
- `public/firebase-client.js`: only one Google popup at a time (two buttons used to open two); readable messages for
  Firebase error codes; `getFreshIdToken()` helper; display-name failures no longer break sign-up.
- `public/app.js`:
  - Firebase ID tokens expire after about 1 hour and were never refreshed, so every API call failed with 401 after an hour.
    Requests now ask the SDK for the current token and retry once on 401.
  - The sign-in button and the auth listener both loaded the workspace after login (double load). They now share one
    in-flight promise.
  - The email sign-in button stayed stuck on "Connecting…" after a successful login; it is now always reset.
  - After email sign-up the token is refreshed so it contains the display name; the listener no longer races the sign-up.
  - Display-name changes refresh the token so the new name shows after a reload.
  - Guest start now reports server errors instead of failing silently.
- `server/index.js`:
  - `trust proxy` enabled for Vercel (rate limiting was keyed to Vercel's proxy IP, not the visitor).
  - `GUEST_TOKEN_SECRET` must be 32+ characters in production; the built-in fallback secret is no longer accepted there.
  - Record IDs are validated as UUIDs (no more Postgres "invalid uuid" errors for bad URLs).
  - A failed audit-log write no longer turns a successful action into a 500.
  - `upgrade-insecure-requests` is only sent in production (it breaks plain-http localhost).

**Known limitation (not changed).** Guest workspaces are kept in server memory. On Vercel each request can run on a
different instance, so guest data can disappear. Signed-in accounts store data in Supabase and are not affected.
