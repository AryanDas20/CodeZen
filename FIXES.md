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
