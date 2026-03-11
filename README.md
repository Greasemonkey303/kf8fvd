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
```

Admin utilities and monitoring scripts:

- `node scripts/check_db_locks.js` — show recent `auth_locks`, `login_attempts`, and `two_factor_codes` rows.
- `node scripts/cleanup_admin_actions.js <days>` — delete `admin_actions` older than `<days>` (defaults to 365).
- `node scripts/monitor_auth_locks.js` — print counts for `auth_locks`, `login_attempts`, and Redis `rl:*` keys.

E2E testing:

- A Playwright scaffold exists at `tests/playwright/placeholder.spec.ts`. Install Playwright and write tests in that folder for browser-driven flows (Turnstile requires a staging/test key).

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

Sample Prometheus alert rules are under `monitor/prometheus/auth_locks_alert.yml` (alert when `auth_locks_total > 0`).

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


