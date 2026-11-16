# BrandWeave

BrandWeave is an evidence-led brand governance workspace: one source of truth for brand facts, terminology, policies and content review decisions. It is deliberately not an auto-publishing tool. AI assistance can prepare recommendations and actions, but consequential changes require human confirmation.

## Stack and data flow

- **Firebase Authentication only**: Google and email/password sign-in. Firebase Admin verifies ID tokens and updates the Firebase Auth display name.
- **Supabase REST (PostgREST)**: all persistent BrandWeave records (brand sources, reviews, revisions, decisions and audit events) are stored in `public.brandweave_records`.
- **Supabase Storage REST**: uploaded source documents are stored in the private `brandweave-sources` bucket.
- **Express on Vercel**: verifies Firebase ID tokens, then performs server-side Supabase REST and Storage requests. Supabase secret/service-role credentials are never sent to the browser.
- **Guest mode**: temporary in-memory data only; it may be lost when a Vercel function instance is recycled.

Firestore and Firebase Storage are not used by this version. Do not create a Firestore database or deploy Firebase database/storage rules for BrandWeave.

## Requirements

- Node.js 22
- A Firebase project with Authentication enabled (Google and Email/Password providers)
- A Supabase project with Data API enabled
- A Vercel account for deployment

## Local setup

1. Copy `.env.example` to `.env`.
2. Fill in Firebase web configuration: `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_MESSAGING_SENDER_ID`, and `FIREBASE_APP_ID`.
3. Add the Firebase service-account JSON to `FIREBASE_SERVICE_ACCOUNT_JSON`. It is used only for Firebase Authentication Admin operations. Never commit it.
4. Fill in `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. A current Supabase secret key (`sb_secret_...`) is preferred; the legacy `service_role` JWT is also accepted. This key is server-only.
5. In Supabase Dashboard -> SQL Editor, run the complete `supabase-schema.sql` file once. It creates the records table, enables RLS, restricts table access to the server role, and creates the private file bucket.
6. Run `npm install`, then `npm run dev`.

## Vercel deployment

1. Push the project files to your GitHub repository and import that repository at https://vercel.com/new.
2. Use Root Directory `./`, Framework Preset `Other`, and leave Build Command and Output Directory blank. Vercel installs dependencies from `package.json`.
3. Add these Vercel Environment Variables for Production (and Preview/Development if needed):

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `GUEST_TOKEN_SECRET` | A random secret of at least 32 characters |
| `FIREBASE_API_KEY` | Firebase Web App API key |
| `FIREBASE_AUTH_DOMAIN` | e.g. `your-project.firebaseapp.com` |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_MESSAGING_SENDER_ID` | Firebase sender ID |
| `FIREBASE_APP_ID` | Firebase Web App ID |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Entire service-account JSON, kept secret |
| `SUPABASE_URL` | `https://YOUR_PROJECT_REF.supabase.co` |
| `SUPABASE_SECRET_KEY` | Supabase `sb_secret_...` key (server-only) |
| `SUPABASE_STORAGE_BUCKET` | `brandweave-sources` |

Do not add Firebase Storage bucket settings. Do not add Supabase keys to browser code or commit them to GitHub. Do not set `GOOGLE_APPLICATION_CREDENTIALS` on Vercel.

4. Run `supabase-schema.sql` in the Supabase SQL Editor before testing persistent features.
5. In Firebase Console -> Authentication -> Settings -> Authorized domains, add your Vercel hostname (for example `brandweave.vercel.app`, without `https://`). Enable Google and Email/Password sign-in providers.
6. Redeploy after adding or changing environment variables.

## Supabase REST and security

The server accesses `brandweave_records` using the Supabase REST endpoint `/rest/v1/brandweave_records`. Each record is scoped by the Firebase Auth UID (`owner_uid`) and collection name. The browser never receives the Supabase secret/service-role key. The SQL setup enables Row Level Security and grants table access only to `service_role`; the Express server is the trusted access layer and filters every record operation by the verified Firebase UID. Keep the Supabase secret key private.

The Storage bucket is private. Upload and delete requests are made by the Express server through Supabase Storage REST. Uploaded file paths are namespaced under `workspaces/{firebase-uid}/sources/`.

## Health check

Open `https://YOUR-VERCEL-DOMAIN/api/health`. A fully configured deployment should report `firebaseAuth: true`, `firebaseWeb: true`, `firebaseAdmin: true` and `supabase: true`. If sign-in is not ready, inspect `firebaseStatus`, `firebaseMessage` and `missingFirebaseWebFields`; these fields identify the missing setup without exposing credentials. The deployment guide includes a diagnostic-code table.

## Upload limits

Vercel Functions have a 4.5 MB request-body limit. This build limits server-mediated uploads to 4 MB to leave room for multipart overhead. Larger uploads require a direct signed upload flow to Supabase Storage.

## Current product boundaries

- The first-pass review engine is deterministic and rule-based, not semantic AI or legal/factual verification.
- A possible source match is not proof that a claim is substantiated.
- Human review and approval remain required; there is no automatic publishing.
- Guest workspace data is temporary and held in function memory.
- Agent37 is an optional bridge adapter and is not active until a documented endpoint and request schema are configured.
