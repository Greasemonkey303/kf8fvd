This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Database migrations & admin utilities

Run SQL migrations with the helper script:

```powershell
node scripts/apply_migration.js migrations/2026_03_10_add_auth_tables.sql
node scripts/apply_migration.js migrations/2026_03_11_admin_actions.sql
node scripts/apply_migration.js migrations/2026_03_20_create_onair.sql
```

Admin utilities and monitoring scripts:

- `node scripts/check_db_locks.js` — show recent `auth_locks`, `login_attempts`, and `two_factor_codes` rows.
- `node scripts/cleanup_admin_actions.js <days>` — delete `admin_actions` older than `<days>` (defaults to 365).
- `node scripts/monitor_auth_locks.js` — print counts for `auth_locks`, `login_attempts`, and Redis `rl:*` keys.
- `npm run monitor:abuse` — summarize failed-login, contact abuse, password-reset, and suspicious admin-action spikes using recent DB windows.
- `npm run monitor:abuse -- --json` — emit the same abuse report as JSON and exit non-zero on warning/critical thresholds.
- `npm run attachments:migrate` — dry-run migration of legacy contact attachments from `data/uploads` into MinIO-backed `messages/` objects.
- `npm run attachments:migrate -- --apply` — upload legacy message attachments to MinIO and rewrite `messages.attachments` metadata to use object keys.
- `npm run media:migrate-site` — dry-run migration of bundled non-logo site images from `data/static-media-source/` into MinIO-backed `hero/`, `about/`, and `projects/hotspot/` objects.
- `npm run media:migrate-site -- --apply` — upload the bundled site images to MinIO and rewrite legacy DB references away from old `/public` paths.
- `npm run readiness:backend` — validate required backend env plus live MySQL, Redis, and MinIO connectivity.
- `npm run readiness:backend -- --storage-write-test` — additionally write and delete a temporary object under `healthchecks/` to verify storage round-trip safety.
- `npm run verify:release` — run the repo’s main pre-release gate in order: migration status check, lint, tests, build, backend readiness, and storage orphan audit.
- `npm run verify:release -- --with-storage-write-test` — include the readiness script’s temporary storage write/delete verification.
- `npm run migrations:check` — report migration files not yet recorded in `schema_migrations`; exits non-zero when anything is pending.
- `node scripts/check_pending_migrations.js --bootstrap-existing` — record the current migration files as already applied without executing SQL, for environments you have already validated manually.
- `npm run backup:snapshot` — create a fresh MySQL backup artifact and local MinIO mirror under `data/backups/`.
- `npm run backup:drill` — run the full backup workflow plus a MySQL restore-count verification and sampled MinIO restore check.
- `npm run storage:audit-orphans` — report DB references pointing to missing MinIO objects and scanned MinIO objects no longer referenced by DB rows.
- `npm run storage:audit-orphans -- --apply` — delete only the unreferenced MinIO objects found by the audit.
- `npm run cleanup:artifacts` — dry-run cleanup of old generated backup drill folders, transient test-results files, and `tmp_*.txt|log` repo artifacts.
- `npm run cleanup:artifacts -- --apply` — remove those generated artifacts using the current retention settings.

Storage orphan cleanup is manual by default. The recommended operating mode is manual cleanup before major content maintenance, with optional scheduled dry-run reporting if the bucket starts accumulating more media over time.

Contact-form attachments now use MinIO under the `messages/` prefix so they are covered by the same object-storage backup and restore workflow as the rest of site media. Use `npm run attachments:migrate -- --apply` once per environment to rewrite older disk-backed message attachments.

Content deletes now archive row snapshots plus object copies under the MinIO `trash/` prefix before removing the live record. Apply `migrations/2026_03_29_content_deletion_log.sql` to enable the deletion log table before using the safer delete flows.

E2E testing:

- A Playwright scaffold exists at `tests/playwright/placeholder.spec.ts`. Install Playwright and write tests in that folder for browser-driven flows (Turnstile requires a staging/test key).
- Destructive backend delete coverage now lives in `tests/integration/destructiveFlows.spec.ts` and can be run with `npx vitest run tests/integration/destructiveFlows.spec.ts`.

Playwright CI (staging)
-----------------------

Add repository secrets in GitHub for `SITE_URL`, `CF_TURNSTILE_SITEKEY`, `CF_TURNSTILE_SECRET`, `NEXTAUTH_SECRET`, DB and Redis connection variables. The workflow `.github/workflows/playwright.yml` will run Playwright tests against `SITE_URL` when those secrets are set.

Quick start (local):

```bash
# install deps (this will be heavy: Playwright browsers)
npm ci
npx playwright install --with-deps
npm run e2e
```

Redis failover & exporter
-------------------------

Run a quick connectivity test across multiple Redis endpoints:

```bash
# comma-separated URLs or set REDIS_URL
REDIS_FAILOVER_URLS=redis://:pass@redis1:6379,redis://:pass@redis2:6379 npm run redis:failover-test
```

Start the Prometheus exporter which exposes metrics on `/metrics` (default port `9403`):

```bash
npm run exporter:start
```

Sample Prometheus alert rules are under `monitor/prometheus/auth_locks_alert.yml` and now include failed-login, contact-abuse, password-reset, and suspicious admin-action spike thresholds.

Abuse monitoring runbook: `docs/runbooks/abuse-monitoring.md`

Admin actions shipper
---------------------

Ship `admin_actions` rows to an external SIEM by setting `SIEM_ENDPOINT` and optionally `SIEM_API_KEY`, then run:

```bash
SIEM_ENDPOINT=https://siem.example.com/ingest SIEM_API_KEY=XXX npm run ship:admin
```

An example systemd unit is provided at `deploy/admin_actions_shipper.service`.


CSP reporting (staging)
----------------------

To safely tighten CSP in staging before production, enable report-only mode which sends violation reports to the app for inspection:

```bash
# set this in your staging environment
CSP_REPORT_ONLY=1
# start the app and exercise pages; reports will be POSTed to /api/csp/report
```

Collected reports are stored in the `csp_reports` table. You can view recent reports locally with:

```bash
node scripts/query_csp_reports.js
```

Apply the migration added for CSP reporting:

```powershell
node scripts/apply_migration.js migrations/2026_03_12_csp_reports.sql
```

Client error reporting
----------------------

The app now reports uncaught browser errors, unhandled promise rejections, and same-origin fetch failures with status `>= 500` to:

```text
POST /api/client-errors
```

Reports are deduped client-side for 30 seconds, size-limited server-side, rate-limited per source IP, and emitted as structured server logs. In local development, watch the Next.js server output while exercising the UI.

Structured backend logs
-----------------------

Backend routes now emit structured JSON logs for key operational paths such as contact submission, 2FA delivery, uploads, CSP reports, and admin utility actions. Debug-level entries are suppressed in production unless `DEBUG_OBSERVABILITY=1` is set.


