# BrandWeave — Evidence-led brand governance

BrandWeave is a full-stack Round 2 build for Phoenix Coders. It brings approved brand knowledge, explainable content checks, revision history and human decisions into one workspace.

**Product promise:** One source of truth. Every story on-brand.

## What is included

- Dark, responsive enterprise workspace with overview, Brand Memory, Content Review, Review Queue, Approvals, Policy Insights and Audit Trail.
- Firebase Authentication integration for Google and email/password sign-in.
- Guest workspace without login. Guest records are temporary and held in server memory; no sample organisations, campaigns, users, scores or activity are seeded.
- Firebase Admin SDK server authentication, Firestore persistence and Firebase Storage file uploads for signed-in accounts.
- Manual source records for guidelines, approved facts, terminology, policies and other knowledge.
- PDF, DOCX and text extraction for supported uploaded sources.
- Deterministic first-pass checks for comparative claims, absolute/guarantee wording, quantified claims, vague promotional language and manually configured banned terminology.
- Review records with findings, revisions, version history, human decisions and audit events.
- AI command centre with page navigation and confirmation-gated profile changes.
- Agent37 server-side bridge adapter. It does not pretend an instance ID is an embeddable API credential.

## Important build boundaries

1. **No demo data:** a new workspace starts empty. Metrics are derived from records actually created in that workspace.
2. **No automatic publishing:** approval is recorded inside BrandWeave only. Publishing remains outside this MVP.
3. **Human oversight:** findings are signals, not proof. A possible source match must be verified by a reviewer. High-risk approval requires an additional acknowledgement.
4. **Agent37:** the public Agent37 Personal page describes hosted agents, but an instance ID by itself does not define a browser-embeddable chat API. The adapter in `server/agent37.js` expects a separately documented, supported bridge endpoint. Until one is provided and tested, built-in workspace commands still work and the UI reports that Agent37 is not connected. Do not put Agent37 secrets in browser code.
5. **Personal workspace MVP:** the current workspace is scoped to the signed-in user's UID. Team invitations, granular creator/manager/reviewer/admin roles and multi-tenant organisation switching are designed follow-on work, not falsely represented as complete.
6. **Guest privacy:** guest records exist only in the running server's memory and expire with the 12-hour signed token. A server restart clears them. Do not enter confidential company content in guest mode.

## Requirements

- Node.js 22.x.
- A Firebase project with Authentication, Cloud Firestore and Cloud Storage enabled for persistent accounts.
- A registered Firebase Web App configuration.
- Firebase Admin credentials for the Node.js server.

## Run locally

```bash
cp .env.example .env
npm install
npm start
```

Open `http://localhost:3000`.

Guest mode works without Firebase credentials. Google and email authentication plus persistent storage require Firebase setup below.

## Firebase setup

1. Create a Firebase project at https://console.firebase.google.com/.
2. Add a Web App and copy its configuration values into `.env`:
   - `FIREBASE_API_KEY`
   - `FIREBASE_AUTH_DOMAIN`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_STORAGE_BUCKET`
   - `FIREBASE_MESSAGING_SENDER_ID`
   - `FIREBASE_APP_ID`
3. In Firebase Authentication → Sign-in method, enable **Google** and **Email/Password**.
4. Add your local and deployed domains to Authentication → Settings → Authorized domains.
5. Create a Cloud Firestore database and enable Firebase Storage.
6. For local development, create a Firebase service account and set `GOOGLE_APPLICATION_CREDENTIALS` to the absolute path of the JSON file. Never put that JSON file in the ZIP, Git repository or public hosting variables visible to the browser.
7. Alternatively, set `FIREBASE_SERVICE_ACCOUNT_JSON` in the hosting provider's secret environment variables to the one-line service account JSON. Do not commit it.
8. Set `GUEST_TOKEN_SECRET` to a long random secret (32+ characters).
9. Deploy `firestore.rules` and `storage.rules` from the Firebase console or Firebase CLI. This app uses the Node server as the access layer; browser-side direct database/storage access is denied intentionally.
10. Restart the server and verify `/api/health` reports Firebase as ready. Test Google login and email/password login with real accounts.

The Firebase web config is intended to be available to the browser; the Admin service-account credential and any API tokens must remain server-side secrets.

## File uploads

Signed-in users can upload PDF, DOCX, TXT, Markdown, CSV and common image files up to 4 MB per request (Vercel Function request-body limit). Files are saved under a user-scoped Storage path. The server attempts text extraction for PDF, DOCX and text-based files. Image uploads are stored, but image/logo similarity analysis is not implemented in this release. Guest mode intentionally offers manual text sources only.

## Agent37 integration

The project includes a server-side adapter in `server/agent37.js`. It accepts these optional environment settings:

```env
AGENT37_BRIDGE_URL=
AGENT37_BRIDGE_TOKEN=
AGENT37_INSTANCE_ID=
```

Only set them when Agent37 or a supported integration provider gives you a documented endpoint and payload contract. The adapter currently sends a JSON body containing `instanceId`, `message`, a minimal user identity, limited workspace context and explicit safety constraints. It accepts a plain-text `reply` or `message` field. If the actual supported Agent37 bridge uses another contract, update the adapter and test it before enabling the integration. An instance ID alone is not a public API key.

The event instructions you shared say to create the agent from https://www.agent37.com/personal (the Hackyard offer link is https://www.agent37.com/redeem/HACKYARD) and submit the instance ID and dashboard screenshot via the Hackyard Agent37 form. They also warn not to use the Cloud Sandbox/API page or enter card details for this challenge.

## AI command centre behavior

Built-in actions available now:

- Navigate to Overview, Brand Memory, Content Review, Review Queue, Approvals, Policy Insights and Audit Trail.
- Prepare a profile display-name update. The assistant shows the proposed value; the server applies it only after the user confirms.
- Explain supported product boundaries and point users to the correct workflow.

The action router is allowlisted. It does not expose arbitrary Firestore access, shell execution, publishing, bulk approvals or unrestricted browser control. Add new tools one at a time with server-side authorization, validation, confirmation and audit logging.

## Deployment on Vercel

This project is configured for Vercel's Express integration. The root `index.js` exports the Express app as a Vercel Node.js Function. Vercel serves files in `public/` through its CDN; there is no separate frontend build or output directory.

Follow [`VERCEL_DEPLOYMENT.md`](./VERCEL_DEPLOYMENT.md) for the complete GitHub import, environment variable, Firebase Authorized Domains, and verification steps. Do not use Render-specific build/start settings.

Vercel Functions have a 4.5 MB request-body limit, so server-mediated uploads are limited to 4 MB in this build. Guest state remains in function memory and can reset when Vercel recycles an instance; signed-in records remain in Firestore.

## Verification checklist before judges use it

- [ ] Open the deployed site in a private/incognito window.
- [ ] Continue as guest and verify that every page starts empty.
- [ ] Create a real manual brand source and confirm it appears in Brand Memory.
- [ ] Submit a real draft and confirm findings are tied to the exact excerpt.
- [ ] Revise the draft and confirm a new version is recorded.
- [ ] Request changes or approve after reviewing evidence; check the audit trail.
- [ ] Sign in with Google and confirm data persists after refresh.
- [ ] Upload a real PDF or DOCX and verify file storage and text extraction.
- [ ] Test on mobile width and use keyboard navigation.
- [ ] Verify Agent37 separately; do not claim it is connected until the supported bridge has been tested end-to-end.

## Current limitations / next build layer

- The present analysis engine is deterministic and transparent; it is not a full semantic LLM or legal/factual verification system.
- Visual identity comparison, colour contrast analysis of uploaded assets, semantic retrieval/embeddings, real-time collaborative comments, role management, reviewer assignment and scheduled expiry alerts need further implementation and evaluation.
- The PDF/DOCX pipeline extracts text; it does not yet preserve document layout or perform robust OCR on images.
- Insights are descriptive counters from real records, not statistically validated quality metrics.
- The Agent37 external bridge must be confirmed against the actual integration contract.

This is an implementation baseline, not a claim that every planned future feature has already been delivered. Verify the deployment checklist before presenting it to judges.
