# BrandWeave — Vercel deployment (beginner guide)

## A. Prepare the repository

1. Extract the ZIP on your computer.
2. Upload the extracted project contents to a GitHub repository (the files `index.js`, `package.json`, `server/`, `public/`, and `supabase-schema.sql` must be at the repository root).
3. Keep the GitHub repository private if it contains any internal project work. Never commit `.env`, Firebase service-account JSON, or Supabase secret keys.

## B. Create the Vercel project

1. Open https://vercel.com/new and import the GitHub repository.
2. Project name: `brandweave` (or your preferred name).
3. Framework Preset: `Other`.
4. Root Directory: `./`.
5. Leave Build Command and Output Directory blank. Leave Install Command at its default.
6. Deploy. The first deployment may show an unconfigured backend until environment variables and Supabase schema are ready.

## C. Configure Firebase Authentication

Firebase is used only for login and verifying user identity.

1. Open Firebase Console -> select your project -> Project settings -> General -> Your apps -> Web app. Copy the Web App config values.
2. Enable Google and Email/Password under Authentication -> Sign-in method.
3. Under Authentication -> Settings -> Authorized domains, add your Vercel hostname (for example `brandweave.vercel.app`, without `https://`).
4. Under Project settings -> Service accounts, generate a private key and download the JSON. Keep it private.

## D. Configure Supabase (database + file storage)

1. Open https://supabase.com/dashboard and create or select a project.
2. In Project Settings / API Keys (or the project's Connect dialog), copy the Project URL and a server-side Secret key (`sb_secret_...`). A legacy `service_role` key is also accepted. Never use a publishable/anon key for this server environment variable.
3. Open Supabase -> SQL Editor -> New query. Open `supabase-schema.sql` from this project, copy all its contents into the SQL editor, and click Run.
4. The SQL creates `public.brandweave_records`, enables Row Level Security, grants access only to the server role, and creates the private `brandweave-sources` Storage bucket.
5. Confirm the bucket appears under Storage. Leave it private.

## E. Add Vercel environment variables

Open Vercel -> your BrandWeave project -> Settings -> Environment Variables. Add each variable for Production (and Preview/Development if you want those environments to work too). Save each one.

| Variable | Value to paste |
|---|---|
| `NODE_ENV` | `production` |
| `GUEST_TOKEN_SECRET` | Random string, at least 32 characters |
| `FIREBASE_API_KEY` | Firebase Web App `apiKey` |
| `FIREBASE_AUTH_DOMAIN` | Firebase Web App `authDomain` |
| `FIREBASE_PROJECT_ID` | Firebase Web App `projectId` |
| `FIREBASE_MESSAGING_SENDER_ID` | Firebase Web App `messagingSenderId` |
| `FIREBASE_APP_ID` | Firebase Web App `appId` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Entire downloaded service-account JSON |
| `SUPABASE_URL` | Supabase Project URL, e.g. `https://xxxx.supabase.co` |
| `SUPABASE_SECRET_KEY` | Supabase server-side `sb_secret_...` key |
| `SUPABASE_STORAGE_BUCKET` | `brandweave-sources` |

Important: Firebase is authentication only. Do not configure Firestore or Firebase Storage. Do not add `FIREBASE_STORAGE_BUCKET`. Do not put the Supabase secret key in any `public/` file. Do not commit secrets to GitHub. Do not set `GOOGLE_APPLICATION_CREDENTIALS` on Vercel.

## F. Redeploy and verify

1. After saving all environment variables, open Vercel -> Deployments and redeploy the latest deployment. Environment variable changes take effect on new deployments.
2. Open `https://YOUR-VERCEL-DOMAIN/api/health`. Expected configured status: `firebaseAuth: true` and `supabase: true`.
3. Test Google/email login, add a brand source, create a review, revise it, record a human decision, refresh the page, and confirm the records persist.
4. Upload a small PDF or DOCX and confirm the source appears.

## G. Notes

- Guest data is temporary and may disappear when Vercel recycles a function instance.
- Signed-in records are persisted in Supabase Postgres via REST. Uploaded documents are stored in the private Supabase Storage bucket.
- Vercel Function request bodies are limited to 4.5 MB; this build limits uploads to 4 MB.
- Agent37 is optional and not connected until you have its documented bridge URL and request schema. An instance ID alone is not an API endpoint or credential.
