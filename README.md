# E-Cell ABESEC website

Responsive React/Vite website with an Express API, verified accounts, and an administrator content studio. The existing black/cream/yellow design and archived content are preserved.

**Hosting target: Vercel now, AWS later.** The Vercel backend path is implemented for Neon PostgreSQL plus Neon Object Storage. Configure the private provider variables and complete real-domain verification before launch. SQLite and local uploaded files remain the local-development fallback. See [VERCEL.md](VERCEL.md) for setup and the launch checklist.

## What is included

- **Authentication:** email-first password sign-in, verified email signup, direct Google sign-in, and password recovery. New email signup and password recovery use a six-digit email code before account/password setup; normal password login and Google login do not send an email code.
- **Restricted administration:** protected owners come from `ADMIN_EMAILS`; owners can grant/revoke content admins from **Admin → Access management**. Every API request checks current server-side grants. Owners cannot be removed through the dashboard, preventing accidental lockout.
- **Events:** create, edit, delete, and browse by year; edit dates, summaries, speakers, venue, registration links, stories, and galleries.
- **People:** manage executives, mentors, alumni, and volunteers by academic batch and group, including photos, roles/departments, descriptions, and social links.
- **Homepage controls:** choose featured events and people and their display order. Unchecking or deleting everything really leaves an empty preview—old hardcoded content does not return.
- **Contact and navigation:** the navbar offers Sign in / Account, idea buttons reach the real contact form, and event sharing reports success/failure. The backend contact form validates and rate-limits messages.
- **Image uploads:** upload event covers, listing images, galleries, and team portraits from your device. Admin → Media lets you reuse uploads and delete unused images.
- **Persistent storage:** Local development uses SQLite and disk; Vercel uses Neon PostgreSQL plus Neon Object Storage. Verified users, password hashes, sessions, verification challenges, administrator grants, content, image metadata and audit records stay server-side. Uploaded image bytes are processed before publication and stored outside the browser/Git.

## Local setup

Requires **Node.js 24+** and npm. SQLite uses Node's built-in `node:sqlite` module; no database service is needed for a single server.

```bash
npm ci
cp .env.example .env  # only on a fresh clone; do not overwrite an existing private .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put the generated random value in `AUTH_SECRET`, then configure `.env`:

| Variable | Purpose |
| --- | --- |
| `AUTH_SECRET` | At least 32 random characters; authenticates stored code hashes. Never use an example value. |
| `ADMIN_EMAILS` | Comma-separated, exact **protected owner** email addresses. Case-insensitive; at least one is required in production. Owners manage additional content admins in the dashboard. Do not use wildcards/domains. |
| `EMAIL_USER` | Gmail mailbox that sends verification and contact emails. |
| `EMAIL_PASS` | A **new Gmail App Password**, not the Gmail account password. |
| `EMAIL_FROM` | Optional authorized sender; defaults to `EMAIL_USER`. |
| `CONTACT_EMAIL` | Optional contact-form recipient; defaults to `EMAIL_USER`. |
| `GOOGLE_CLIENT_ID` | Google OAuth **Web application** client ID. Public identifier; a Google client secret is not needed for this ID-token flow. |
| `APP_ORIGIN` | Exact browser origin, without a trailing slash. `npm run dev` sets this to the available local Vite port; the default is `http://localhost:5173`. |
| `PORT` | Backend port, local default `8000`. The Vite development proxy targets port 8000; update `vite.config.js` if changing this. |
| `DATABASE_URL` | Neon pooled PostgreSQL connection string for Vercel/production. Server-only; never use `VITE_DATABASE_URL`. Leave blank for local SQLite. |
| `DATABASE_PATH` | Local SQLite fallback, relative to the project root or absolute. Default: `backend/data/ecell.sqlite`. Ignored when `DATABASE_URL` is set. |
| `MEDIA_PROVIDER` | `local` for SQLite development or `neon-object-storage` for Neon/Vercel. Defaults to the latter when `DATABASE_URL` is set. |
| `UPLOAD_DIR` | Local image directory, default `backend/data/uploads`. Ignored by Neon Object Storage. Never put this or the database in `public` or `dist`. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Server-only Neon Object Storage credential pair. `neon env pull` can provide these. Never expose them as `VITE_*`. |
| `AWS_ENDPOINT_URL_S3` / `AWS_REGION` / `NEON_STORAGE_BUCKET` | Server-only Neon Object Storage S3 endpoint, region and bucket name. Use path-style endpoint settings supplied by Neon. |
| `UPLOAD_STORAGE_LIMIT_MB` | Total processed-image quota, default 1024 MiB. Each input file is limited to 8 MiB. |
| `NODE_ENV` | `development` locally; **`production`** for live hosting. |
| `TRUST_PROXY_HOPS` | `0` for direct access; otherwise the exact number of trusted reverse proxies. Do not guess or broadly trust arbitrary forwarded headers. |

The backend reads **one root `.env`**, regardless of the shell working directory. The frontend build command explicitly sets `NODE_ENV=production` before invoking Vite, so a local server setting of `NODE_ENV=development` cannot accidentally ship React's development bundle. For a backend environment file completely outside the repository:

```bash
ENV_FILE=/absolute/private/path/ecell.env npm start
```

Environment variables supplied by the hosting platform take precedence. `.env` files, runtime databases, backups, and browser-test output are ignored by Git. `.env.example` contains placeholders only. `VITE_*` values are public browser configuration—**never** put SMTP passwords, allowlists, authentication secrets, or service-account keys in them. The optional legacy Firebase configuration has been moved to environment references; the new CMS does not use Firestore or Firebase authentication.

### Gmail delivery

1. Enable 2-Step Verification on the sending Google account.
2. Generate a Gmail App Password (availability depends on your account/Workspace policy).
3. Set `EMAIL_USER` and `EMAIL_PASS`. Configure an authorized sender if overriding `EMAIL_FROM`.
4. Complete a real signup and check inbox/spam. There is no production bypass, printed code, or fake successful email response when delivery fails.

Codes expire in **10 minutes**, allow **5 incorrect attempts**, and are single-use. Mailboxes have a **60-second delivery cooldown**. New signup is email-only until the code is verified; only then can the user enter a name and matching password (at least 12 characters, at most 256 UTF-8 bytes). No user account is created before completion. Verification issues a short-lived, browser-bound, one-use setup proof in an `HttpOnly` cookie, not a signed-in session. The pending verified signup can be completed within 10 minutes; if it expires, request and verify a fresh code. Additional per-IP/mailbox limits apply. Unknown/duplicate signup and reset requests use the same generic response to reduce account disclosure. Passwords, one-time codes, and setup proofs are never stored in browser local storage.

Returning users enter their email, then their password at `/signin`. Moving to the password step is local UI only: there is no account-discovery request and no OTP on a successful password login. The **Forgot or need to create a password?** link opens `/reset-password`: email → OTP → new password and confirmation → signed-in session. Google-only users can use this flow to create an optional password. `/account` shows linked methods and offers **Create a password** or **Reset password** with the email prefilled; recovery remains accessible while signed in.

### Google sign-in

In Google Cloud, configure an OAuth consent screen and a **Web application OAuth client**. Add `http://localhost:5173` to **Authorized JavaScript origins** for development and the exact HTTPS production origin for deployment. Put the client ID in `GOOGLE_CLIENT_ID`; add test users while the consent app is in testing mode.

Google credentials are verified on the server for signature, audience, issuer, expiration, nonce and verified email using Google's library. Google sign-in establishes a session directly: it does not require a local password or an application email OTP. The server accepts only verified Gmail or Workspace identities and safely links a matching email account only when that Google identity is authoritative. Other third-party Google email users must use email authentication instead. If Google is not configured, its button is unavailable; email authentication remains supported.

### First administrator

1. Add the intended email to `ADMIN_EMAILS` in the private server environment and restart the server.
2. Run `npm run dev` and open the local URL printed by Vite (normally `http://localhost:5173/signup`). If that port is occupied, the launcher uses the next available port and aligns the backend origin automatically. For Google sign-in on that alternate port, add the displayed origin to the OAuth client's authorized JavaScript origins. Enter an email, confirm the emailed code, then enter a name and matching strong password. Alternatively use Google sign-in directly; no application email code is sent.
3. Open `/admin`. As an owner, use **Access management** to authorize more admin email addresses. They can sign up/sign in normally using that exact email. This preauthorization does **not** create an account, password, or send an invitation—share the site URL yourself.
4. Owners can revoke dashboard-granted administrators immediately. Revocation signs out their existing sessions but preserves their personal account and published content. Ordinary content admins cannot grant roles or remove owners. The environment's protected owners can only be changed in `ADMIN_EMAILS` with a backend restart; verify another owner can sign in before removing one.

There is no default admin password or pre-created administrator. User passwords are stored as salted scrypt hashes in the private database, not as environment variables or plaintext. Google-only users may optionally create a password through the verified password-reset flow; their email is prefilled on the account page. A password reset also revokes all prior sessions. Same-email linking is limited to Google-authoritative verified Gmail/Workspace identities. Sessions have an absolute **8-hour** lifetime; logout revokes the current session.

### Add registered users in bulk

- **Content → Team & volunteers → Add users:** choose a destination batch (for example `2025-2026`), group, and optional shared role, then select users to publish their member profiles. Individual roles, portraits, and social links can be edited afterward. **Add member** supports manually entered profiles.
- **Access management:** owners can select multiple registered users and authorize them in one operation. The exact-email form also supports people who have not signed up yet.
- Both user pickers support case-insensitive email/name fragments of **2 or more characters**, team-batch and signup-year filters, page selection, and up to **100 users** per operation. Selection is preserved across searches and pages. Team-batch filters use saved account-linked memberships; signup year refers to account registration. Existing manually entered profiles are not automatically linked to accounts.
- A user can have one linked profile per batch. Existing memberships or access grants are skipped safely, and each bulk change is transactional and audited. Account emails appear only in authenticated admin responses, not public team content.

After updating the authentication code or environment configuration, restart the backend (`Ctrl+C`, then `npm run dev` locally) and refresh the browser. Existing accounts and content are preserved; the setup-proof table is added automatically. Codes issued by the old all-flows-OTP implementation cannot complete the new flow—request a fresh code. Admin users should protect their Google account with 2-Step Verification; the site's password-only login is not multi-factor authentication.

## Content and images

First startup imports `backend/seed-content.json`: **13 events and 135 people**, including 86 volunteers. The initial featured selections match the previous homepage. The seed is imported **once** per database; restarting never overwrites edits or restores deleted records.

`npm run content:export` reproduces the checked-in seed's stable image files from `src/assets` into `public/content-assets`. The generated copies (approximately 118 MB) are ignored by Git and regenerated automatically by `npm run client` and `npm run build`. Keep `src/assets`, `backend/seed-content.json`, and the fallback `public/content-assets/placeholder.svg` in source control. This is **not** a live-database export.

Admin edits publish immediately. Choose files directly in the editor for event covers/listing images/galleries and team portraits. Uploads accept non-animated **JPEG, PNG, or WebP**, at most **8 MiB / 25 megapixels**, resize to fit 2400×2400 and re-encode as WebP with metadata removed. SVG, executable/disguised files and unsupported formats are rejected. Uploads require a current admin session, same-origin request, CSRF protection and rate limits. They are public as soon as uploaded: never upload private or unlicensed images.

**Media** shows uploaded files and their event/team references. You can reuse an image or delete an unused one. Removing an image selection in an editor only clears that content reference; it does not delete the shared file. The server refuses deletion while any saved content still references the image. Abandoned editor uploads remain in Media for deliberate cleanup. Advanced URL fields remain available for existing local/HTTPS images; registration/social links require HTTPS. Changing an event title changes its public URL.

### Where your data actually lives

| Data | Local default | Production requirement |
| --- | --- | --- |
| Events, team members, accounts, admin grants, sessions, upload metadata | Local: `backend/data/ecell.sqlite` plus SQLite WAL/SHM; Vercel: Neon PostgreSQL | Durable Neon database connection (`DATABASE_URL`) |
| Newly uploaded image bytes | Local: `backend/data/uploads/<random-id>.webp`; Vercel: private Neon Object Storage bucket | Neon S3-compatible bucket; `/uploads/...` returns a short-lived signed read URL |
| Initial legacy archive and pictures | Checked-in seed + `src/assets`; generated copies in the build | Delivered with each release; never overwrite live content |
| Database + upload backups | Ignored `backups/` by default | Private, preferably encrypted/off-site, restore-tested storage |

**GitHub is not the database. Firebase is not used for the CMS.** On Vercel, Neon holds database state and Neon Object Storage holds images; deployments do not reset that state. A new empty Neon branch initializes the seed—it does not recover live edits. Back up database records and stored images together using provider-native backups. The previous local persistent-disk restore guide is preserved in `.local-deploy/self-hosted/DEPLOYMENT.md` (ignored, not available in a fresh clone). The Vercel setup is in [VERCEL.md](VERCEL.md).

## What belongs on GitHub

The repository is the shared source of the project, not a copy of the production server. **Keep test source on GitHub** so collaborators and CI can reproduce the checks; exclude generated output and real user data.

| Keep versioned | Keep ignored/local |
| --- | --- |
| `src/`, `backend/` source, `src/assets/`, seed JSON, static source files | `backend/data/` (live SQLite database, WAL/SHM files and uploaded images), `backups/` |
| `tests/`, `backend/tests/`, source `*.test.mjs`, `playwright.config.js`, CI workflow | `test-results/`, `playwright-report/`, `coverage/` |
| `package.json`, `package-lock.json`, build scripts and tool configuration | `node_modules/`, `dist/`, caches, generated `public/content-assets/` copies except `placeholder.svg` |
| `.env.example` with placeholders, README, `VERCEL.md`, `.vercelignore` | Real `.env` files, credentials/keys, `.vercel/` project metadata |
| Application maintenance scripts and their tests | `.local-deploy/` future self-hosting/AWS files, private agent notes |

`.gitignore` controls what should be added to Git. `.vercelignore` separately excludes tests, CI files, local deployment files and private/generated data from Vercel source uploads without removing useful source from GitHub. The frontend build only emits the application and public assets; keeping tests in Git does not make them web pages.

The Dockerfile, Compose configuration, Nginx example and previous deployment guide now live in **`.local-deploy/self-hosted/`**, per the local-only future-hosting plan. This folder is not backed up by GitHub; keep a separate private copy. See its parent `.local-deploy/README.md` for safe restoration. The root `.env` and live `backend/data/` were intentionally left in place, still ignored, so local development keeps working. Do not relocate a database while the server is using it.

## Deployment status

Follow [VERCEL.md](VERCEL.md) for the Vercel deployment. The repository includes the root Express entrypoint, Neon PostgreSQL adapter, Neon Object Storage direct-upload flow and Vercel configuration. A static-only `dist/` deploy would still bypass public API content, sign-in, administration and contact mail.

### Vercel + Neon runtime

Set these server-only Vercel environment variables in Project Settings (Production and a separate preview branch/environment as appropriate):

```dotenv
NODE_ENV=production
APP_ORIGIN=https://your-production-domain.example
AUTH_SECRET=<random-secret>
ADMIN_EMAILS=<protected-owner-email>
DATABASE_URL=<Neon pooled PostgreSQL URL>
MEDIA_PROVIDER=neon-object-storage
AWS_ACCESS_KEY_ID=<Neon storage credential id>
AWS_SECRET_ACCESS_KEY=<Neon storage credential secret>
AWS_ENDPOINT_URL_S3=<Neon branch S3 endpoint>
AWS_REGION=<Neon storage region>
NEON_STORAGE_BUCKET=ecell-media
EMAIL_USER=<mailbox>
EMAIL_PASS=<Gmail app password>
GOOGLE_CLIENT_ID=<Google web client id>
```

Provision a **private** Neon Object Storage bucket and configure its CORS policy to allow `PUT` from the exact `APP_ORIGIN`. The application signs a short-lived browser upload URL, validates and re-encodes the object on the server, then publishes only the processed WebP. Image reads use short-lived signed URLs through `/uploads/<uuid>.webp`. The S3 endpoint must use Neon's path-style configuration (`forcePathStyle` is set by the app).

The root `server.js` is the Vercel Express entrypoint and `vercel.json` provides the production build/function configuration. Connect Vercel to the repository root, keep the build command `npm run build`, and do not set a static-only output that bypasses the server. `DATABASE_URL`, storage credentials, `AUTH_SECRET`, SMTP credentials and any provider secrets are never frontend variables.

### Current persistent-disk runtime (local/future self-hosting)

```bash
npm ci
npm run build
NODE_ENV=production ENV_FILE=/absolute/private/path/ecell.env npm start
```

Serve the built frontend, **`/api`, and `/uploads` from the same origin**. Express serves `dist` and supports direct SPA routes such as `/admin`; unknown routes return the client 404 with HTTP 404. A static-only host or `vite preview` does not provide authentication, mail delivery, or the database. Production startup requires an HTTPS origin, a protected owner, and configured mail credentials. Run `npm run check:config` to validate the selected environment without printing secrets.

The non-root Docker image definition, persistent-volume Compose configuration, Nginx example, and operator checklist are archived under `.local-deploy/self-hosted/`, not shipped in the current GitHub/Vercel source. They are a single-host starting point, not completed AWS infrastructure. No cloud service or domain has been deployed automatically.

- Set `APP_ORIGIN=https://your-domain.example` and terminate HTTPS at a trusted reverse proxy. Production refuses an HTTP origin and sets host-only `Secure`, `HttpOnly`, `SameSite=Strict` session cookies.
- Restrict direct access to the API's backend port if behind a proxy; configure the exact `TRUST_PROXY_HOPS`. Use edge request/connection limits as additional abuse protection.
- Mount persistent storage at **both `DATABASE_PATH` and `UPLOAD_DIR`**. This implementation targets **one Node service with a local persistent SQLite database**, not ephemeral/serverless storage or independent replicated SQLite copies. Scaling to multiple hosts requires a shared database/session/rate-limit design.
- Use `npm run backup -- --maintenance-confirmed` during a maintenance window to create an integrity-checked SQLite snapshot and copy recorded uploaded images together. The script blocks database writers while copying; pause traffic first. Never publish databases, backups, `.env`, or the project root through a static server. Protect backups as they contain account data and password hashes.
- Keep the server clock synchronized. Do not cache `/api` responses. The API uses exact-origin checks, JSON mutations (with a narrowly scoped binary-image upload endpoint), session-bound CSRF tokens, allowlisted content fields, parameterized SQL, security headers and persistent rate limits.
- For emergency session revocation, stop the service and remove records from the `sessions` table using an authorized database tool; changing `AUTH_SECRET` alone does **not** revoke existing opaque sessions.
- SMTP deliverability, Google consent/origin configuration, HTTPS/proxy deployment and backup restoration must be checked in your real hosting environment before release.

### Important credential incident follow-up

The previous repository tracked `backend/.env` and included Firebase configuration directly in `firebase.js`. The tracked environment file has been removed and current local values preserved in an ignored root `.env`. **Removing a file does not remove it from Git history.**

Revoke/rotate any previously committed SMTP App Passwords or other actual secrets before deploying. Review repository access and coordinate any history cleanup with collaborators; this change does not rewrite history. Firebase web identifiers are normally public, but still review API-key restrictions and Firebase security rules. Never grant Firestore access merely because its web API key is known.

## Verification

```bash
npm run check:config
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm audit --omit=dev
```

- Node tests exercise real HTTP requests against isolated SQLite databases: verification, login/reset/logout, session expiry, allowlist denials, CSRF/origin checks, code replay/expiry/attempt limits, setup-proof reuse/concurrency, mail failures, Google nonce/account-linking checks, CRUD persistence, content validation and migration/form behavior. The production Google adapter is also tested with ephemeral RSA keys for signature, issuer, audience and expiry validation; no live Google account is used. Client tests cover stale session-refresh/CSRF races.
- Browser tests run the built app against a separate real Express/SQLite test server at port 4174 on desktop and 390px mobile. Test mail is captured locally for `example.test` identities only. No real emails are sent. The browser suite mocks only the external Google Identity Services script and uses a tightly scoped provider adapter in `backend/tests/browser-server.mjs`; this fixture is not imported by or available to the production server.
- A successful automated check does **not** prove real Gmail delivery or a real Google consent flow; those require your credentials and manual deployment verification.
- Node tests also cover admin grants/revocation, owner protection, image decoding/security/quotas, reference-safe deletion, and database-plus-images backup restoration. Browser tests cover navigation at 320/390/768/1440px, sharing failure states, actual file upload controls and owner/admin boundaries.
- `.github/workflows/checks.yml` runs lint, Node tests, desktop/mobile browser checks and production dependency audit on PRs and main/braj-updates pushes. Tests, source assets, migrations/seed, active Vercel documentation/exclusions and the lockfile belong in Git; credentials, runtime data, generated asset copies and test output do not. Future self-hosting files are intentionally kept local in `.local-deploy/` for this hosting plan.
- This is a JavaScript project; there is no separate TypeScript check. Vite reports the existing large-bundle warning.
- Security-related package updates include Vite, React Router, Firebase and Nodemailer. A same-major `@grpc/grpc-js` override avoids Firebase's vulnerable pinned transitive version. The remaining full-audit advisories are in the development-only Tailwind 3 → `braces` dependency chain; no patched `braces` 3 release was available at implementation time. Do not expose the development server publicly. A Tailwind major-version migration is a separate design-sensitive change.
