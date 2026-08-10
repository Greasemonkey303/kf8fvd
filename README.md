# KF8FVD Amateur Radio Site

KF8FVD is a self-hosted Next.js 16 application for an amateur-radio profile,
station dashboard, logbook data, projects, credentials, contact messaging, and
local-only content administration.

> **Upgrade deployed:** The 2026-08-09 P0-P2 hardening work is deployed and was
> reverified on 2026-08-10 as
> `kf8fvd-app:upgrade-2026-08-09`. The public smoke gate, migrations, dependency
> audit, image scan, tests, responsive browser checks, and restore drills pass.
> See [upgrade.md](upgrade.md) for implementation evidence and external follow-ups.

The remaining owner actions are choosing the new administrator password from
the issued reset email, mounting a genuinely off-host backup destination, and
creating a dedicated staging-only account for authenticated Playwright tests.
The exposed password is already invalid and no production credential should be
entered into repository files, GitHub Actions, or chat.

## Architecture

The production Docker Compose stack contains eight services:

| Service | Purpose | Host exposure |
| --- | --- | --- |
| `kf8fvd` | Next.js application | `127.0.0.1:3000` |
| `db` | MySQL 8.4 application database | `127.0.0.1:3306` |
| `redis` | Rate limiting and operational state | `127.0.0.1:6379` |
| `minio` | S3-compatible media/object storage | `127.0.0.1:9000-9001` |
| `proxy` | Nginx public reverse proxy and admin boundary | Docker network only |
| `tunnel` | Cloudflare Tunnel connection | Outbound only |
| `umami` | Self-hosted analytics | `127.0.0.1:3001` |
| `umami-db` | PostgreSQL database for Umami | Docker network only |

The intended public request path is:

```text
Browser -> Cloudflare -> cloudflared -> Nginx -> Next.js / MinIO / Umami
```

The public Nginx host returns `404` for `/admin`, `/api/admin/*`, and admin
upload helpers. Administrators use the localhost-bound app at
`http://127.0.0.1:3000/admin` through a secured operator connection.

See [docs/PRODUCTION_DEPLOY_RUNBOOK.md](docs/PRODUCTION_DEPLOY_RUNBOOK.md) for
the deployment sequence and [upgrade.md](upgrade.md) for the current remediation
plan.

## Requirements

- Docker Engine with Docker Compose v2 for the production stack.
- Node.js 20 and npm for local development and repository checks.
- MySQL, Redis, and MinIO configuration.
- NextAuth, encryption, Turnstile, SendGrid, Umami, and Cloudflare secrets.
- A pre-created MinIO bucket configured by `NEXT_PUBLIC_S3_BUCKET`.

Keep secrets in the production environment or a secret manager. Do not commit
`.env`, `.env.local`, generated secret files, test credentials, or presigned
responses.

## Local Development

Install the locked dependencies and start Next.js:

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. Features that use authentication, storage,
database data, email, analytics, or rate limiting require their corresponding
local/test services and environment variables.

## Docker Compose

Validate the resolved configuration before starting or updating services:

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

Local operator endpoints are:

- Site/application: `http://127.0.0.1:3000`
- Umami: `http://127.0.0.1:3001`
- MinIO API: `http://127.0.0.1:9000`
- MinIO console: `http://127.0.0.1:9001`

MySQL and Redis are also bound to localhost. Do not expose these ports publicly.

Compose supports `DOCKER_DB_*`, `DOCKER_REDIS_*`, and `DOCKER_MINIO_*`
overrides. The stack defines `db`, `redis`, and `minio` service aliases. Set the
Docker overrides to those aliases when using the Compose-managed services; the
compatibility fallback remains `host.docker.internal` for intentionally
host-managed services.

Required Umami settings include:

- `UMAMI_POSTGRES_DB`
- `UMAMI_POSTGRES_USER`
- `UMAMI_POSTGRES_PASSWORD`
- `UMAMI_APP_SECRET`
- `NEXT_PUBLIC_UMAMI_WEBSITE_ID`
- `NEXT_PUBLIC_UMAMI_HOST_URL`
- `NEXT_PUBLIC_UMAMI_SCRIPT_URL` (optional when derived from the host URL)
- `NEXT_PUBLIC_UMAMI_DOMAINS` (optional comma-separated production domains)

The frontend tracker loads only when its public configuration exists, respects
Do Not Track, removes URL search parameters, and excludes admin, API, and account
management routes.

## Validation and Release Gate

Run focused checks while developing:

```bash
npm run scan:secrets
npm run audit
npm run lint
npx tsc --noEmit
npm run test:coverage
npm run build
```

Run the complete release gate from an environment with the required backend
configuration:

```bash
npm run verify:release
npm run verify:release -- --with-storage-write-test
npm run verify:release -- --with-storage-write-test --with-public-smoke
npm run smoke:production
```

The storage write test creates and deletes a temporary object under the
`healthchecks/` prefix. Do not release while migrations, lint, tests, build,
backend readiness, dependency/security review, or the public smoke check are
failing.

## Production Deployment

This application is deployed as a self-hosted container stack, not through the
default Vercel workflow. Before a production update:

1. Review [upgrade.md](upgrade.md) and any pending external follow-ups.
2. Take verified MySQL, MinIO, and Umami PostgreSQL backups; require the
	configured off-host mount for production releases.
3. Check pending migrations with `npm run migrations:check`.
4. Run the release gate and container vulnerability scan.
5. Build an immutable, versioned image.
6. Deploy through the Nginx and Cloudflare Tunnel path.
7. Verify the public origin reaches a final `200` without a redirect loop.
8. Verify public admin and private object-storage paths remain inaccessible.

The app image uses Next.js standalone output, runs as a non-root user, and is
built only from public build arguments. Runtime secrets are supplied through the
owner-readable `.env` file. `kf8fvd-ops:upgrade-2026-08-09` is the separate
production-dependency image used by backup, readiness, audit, and cleanup jobs.

## Database migrations & admin utilities

Run SQL migrations with the helper script:

```powershell
node scripts/apply_migration.js migrations/2026_03_10_add_auth_tables.sql
node scripts/apply_migration.js migrations/2026_03_11_admin_actions.sql
node scripts/apply_migration.js migrations/2026_03_20_create_onair.sql
node scripts/apply_migration.js migrations/2026_08_09_add_user_session_version.sql
node scripts/apply_migration.js migrations/2026_08_09_add_deletion_cleanup_state.sql
node scripts/apply_migration.js migrations/2026_08_09_add_operational_query_indexes.sql
node scripts/apply_migration.js migrations/2026_08_09_enforce_featured_hero_image.sql
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
- `npm run smoke:production` — reject redirect loops, missing security headers, exposed admin/upload routes, detailed public health data, and private-media access.
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
- `npm run cleanup:operational` — dry-run retention for expired OTP, CSP, auth, reset, audit, deletion-log, and maintenance rows; add `-- --apply` to commit the cleanup transaction.
- `scripts/create_production_snapshot.sh` — create checksummed MySQL, MinIO, and Umami PostgreSQL snapshots, checksum-sync the single local rolling mirror, and optionally replicate it to `BACKUP_REMOTE_DIR`.
- `POST /api/admin/deletion-cleanup` — authenticated retry of pending object cleanup records after database-first content deletion.

Storage orphan cleanup is manual by default. The recommended operating mode is manual cleanup before major content maintenance, with optional scheduled dry-run reporting if the bucket starts accumulating more media over time.

Contact-form attachments now use MinIO under the `messages/` prefix so they are covered by the same object-storage backup and restore workflow as the rest of site media. Use `npm run attachments:migrate -- --apply` once per environment to rewrite older disk-backed message attachments.

Content deletes archive row snapshots plus object copies under MinIO `trash/`,
commit the database mutation, then clean live objects. Failed object cleanup is
recorded as pending and can be retried through the authenticated cleanup route.

User-level systemd timers are active for daily snapshots and weekly operational
retention. Daily backups checksum-sync into the single owner-only rolling mirror
at `/opt/kf8fvd/data/rolling-backup/current`; unchanged MinIO objects are not
copied again and temporary timestamp directories are removed after verification.
Configure `~/.config/kf8fvd/backup.env` from
`deploy/reference/backup.env.example` to additionally require replication to an
off-host mounted destination.

After mounting an NFS, SMB, SSHFS, or rclone-backed destination, configure and
verify off-host replication with:

```bash
scripts/configure_offsite_backup.sh /mounted/offsite/kf8fvd
```

To configure state-changing staging authentication tests without placing the
password in shell history, enter the values through hidden/read prompts and run
the GitHub helper:

```bash
read -r -p "Staging test email: " PLAYWRIGHT_TEST_EMAIL
read -r -s -p "Staging test password: " PLAYWRIGHT_TEST_PASSWORD; echo
export PLAYWRIGHT_TEST_EMAIL PLAYWRIGHT_TEST_PASSWORD
scripts/configure_staging_auth_secrets.sh
unset PLAYWRIGHT_TEST_EMAIL PLAYWRIGHT_TEST_PASSWORD
```

E2E testing:

- Playwright smoke and auth coverage lives under `tests/playwright/` and runs desktop Chromium, desktop Firefox, and mobile Chromium. Browser-driven auth mutations run once in desktop Chromium and require staging-only credentials supplied through environment variables; never add credential fallbacks to tracked tests.
- Destructive backend delete coverage lives in `tests/integration/destructiveFlows.spec.ts` and can be run with `npx vitest run tests/integration/destructiveFlows.spec.ts`.
- Current validation evidence and remaining external actions are tracked in [upgrade.md](upgrade.md).

Playwright CI (staging)
-----------------------

The GitHub `staging` environment and its non-sensitive `SITE_URL` variable are
configured. Create a dedicated staging account, then use
`scripts/configure_staging_auth_secrets.sh` to add only its
`PLAYWRIGHT_TEST_EMAIL` and `PLAYWRIGHT_TEST_PASSWORD` environment secrets.
Never use the production administrator account for CI. Public browser checks run
without those credentials; state-changing authentication checks remain skipped
until the dedicated staging credentials are configured.

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


