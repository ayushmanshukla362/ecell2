# Vercel deployment status

**The Vercel + Neon implementation is prepared, but no deployment, DNS change, or cloud resource has been created.** A successful Vite build alone is not proof that the production backend is configured; complete the private environment setup and real-domain verification below.

## What is ready

- The React/Vite frontend builds with `npm ci` and `npm run build` using Node.js 24.
- The build exports the versioned seed images from `src/assets` to `public/content-assets`, then creates `dist/`. Do not commit the generated copies or `dist/`.
- `.vercelignore` defines deployment-source exclusions for local hosting files, environment files, runtime data, tests, test output, and CI configuration. Tests remain available in GitHub and run in CI.
- Docker/Nginx/persistent-disk hosting files have been preserved in the **ignored local-only** `.local-deploy/self-hosted/` folder. They are not Vercel inputs and are not available in a fresh clone. See `.local-deploy/README.md` on the original working machine for restoration instructions. Keep a private backup of that folder if needed later.

## Why deploying `dist/` alone is insufficient

The browser calls the same-origin Express API for public content, authentication, contact mail and administration. The local Vite proxy is only a development feature; Vercel does not run `npm run dev` or `npm start` as a persistent companion service to a static Vite build. A frontend-only deployment would leave these features broken.

The backend currently requires:

| Data | Current storage | Needed for the full app on Vercel |
| --- | --- | --- |
| Users, password hashes, sessions, verification proofs, role grants, content, audit records, rate limits, image metadata | Local fallback: SQLite at `DATABASE_PATH`; Vercel target: Neon PostgreSQL via `DATABASE_URL` | Neon pooled PostgreSQL with serverless-safe transactions |
| Uploaded image bytes | Local files at `UPLOAD_DIR` | Neon Object Storage S3-compatible bucket, with presigned browser uploads and authenticated publication/deletion |
| Initial seed and legacy pictures | Versioned JSON and source assets | Build assets plus a one-time database seed/import |

Vercel Functions do **not** provide a persistent writable application disk. Moving SQLite/images to `/tmp` does not fix this: temporary files are not shared durable storage. Do not upload the live database as a build input, seed fresh accounts per invocation, or store credentials in `VITE_*` variables.

The application keeps its **8 MiB** product limit while Vercel Functions have a **4.5 MB request/response payload limit**: the browser uploads directly to a private Neon Object Storage staging object through a short-lived presigned PUT URL. The server then downloads and validates the staged bytes, strips metadata, rotates/resizes/re-encodes WebP, checks admin/session/quota state, and publishes the final object. It preserves CSRF/origin protections, quotas and reference-safe deletion; it does not trust a client URL or MIME type.

## Selected storage: Neon PostgreSQL + Neon Object Storage

Neon Object Storage is S3-compatible and branches alongside Neon databases, so preview storage can be isolated from production. The existing authentication and owner/admin roles remain application-owned. This can continue to serve an AWS-hosted app later; moving the actual data to AWS RDS/S3 would still be a separate migration.

### Provision the Neon bucket

Use a Neon project/branch in a region supported by Neon Object Storage, then provision a **private** bucket. Neon currently documents these S3-compatible environment variables:

```bash
neon buckets create ecell-media
neon credentials create --scope storage:read --scope storage:write
neon env pull
```

Alternatively declare the bucket through `neon.ts` and run `neon deploy`, then pull the generated `AWS_*` values. Obtain `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and the bucket name from Neon. Keep the secret credential private and rotate it if it was exposed. Configure bucket CORS to permit `PUT` from the exact production `APP_ORIGIN`; after setting the private variables locally, the repository helper can apply the policy with `npm run storage:configure`. The browser sends the file directly to a short-lived presigned URL so it does not exceed Vercel's 4.5 MB function request limit.

Do not paste connection strings, storage credentials or API keys into chat, commit them, or put them in browser environment variables. Set them only as server-side Vercel environment variables.

An alternative is Vercel for the frontend with the existing backend on a persistent-disk host. That is a different deployment choice: it needs explicit same-origin `/api` and `/uploads` routing, proxy/security configuration, and a reachable HTTPS backend. No such host or routing has been configured here.

## Implementation and launch checklist

After the storage choice:

1. Run the PostgreSQL schema/seed initialization through the first controlled Vercel request. Preserve existing password hashes, account identities, admin grants and desired live edits through a deliberate migration; a clean database imports the seed, not local live data. Never move an actively used SQLite database without a consistent export/migration.
2. Use the implemented direct upload flow: the browser requests a short-lived signed PUT URL, uploads to private Neon Object Storage, and calls finalize. The server downloads only the staged object, validates the actual image, strips metadata, rotates/resizes/re-encodes WebP, checks the current admin session and quota, then publishes a final object. Staging objects are removed after finalization/failure.
3. Use the root `server.js` Vercel Express entrypoint and `vercel.json`. The app serves `/api/*`, SPA routes and `/uploads/*`; the function configuration includes the built frontend assets. Confirm deep links, API 404s and missing image 404s after deployment.
4. Configure the Vercel project from the repository root with Node.js **24.x**, locked npm dependencies, `npm run build`, and the server-side variables in the README. Set private production/preview variables independently. Do not share production data or secrets with untrusted preview deployments.
5. Configure the real HTTPS `APP_ORIGIN`, Google authorized origin/consent, mail sender, protected owner and Neon bucket CORS. Preview URLs require an explicit origin/authentication policy; do not simply trust arbitrary origins or forwarded headers.
6. Verify serverless shared sessions/rate limits, one-use proofs, concurrent edits/uploads, real email delivery, Google sign-in, admin grant/revoke, page refresh/deep links, and durable images/data across deployments and cold starts.
7. Configure Neon database/time-travel/provider-native object backups, then rehearse restoring both together. `npm run backup` currently backs up only the local SQLite/filesystem implementation; it is not a backup tool for Neon.
8. Rotate previously exposed credentials and finish the content/privacy/image-rights review before public launch.

Until then, `npm run dev` remains the complete local application; `npm run build` verifies only that the frontend can be built.

## Official platform references

- [Vercel source exclusions](https://vercel.com/docs/deployments/vercel-ignore)
- [Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js)
- [Function limits, including upload payload size](https://vercel.com/docs/functions/limitations)
- [SQLite on Vercel](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel)
- [Neon Object Storage overview](https://neon.com/docs/storage/overview)
- [Neon Object Storage quickstart](https://neon.com/docs/storage/get-started)
- [Neon Object Storage S3 compatibility](https://neon.com/docs/storage/s3-compatibility)
