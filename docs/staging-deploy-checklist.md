# Staging Deploy Checklist

1. Create a staging host (VM/container) and provision DNS for `staging.YOURDOMAIN`.
2. Configure secrets/env for the staging host:
   - `NODE_ENV=production`
   - `NEXT_PUBLIC_SITE_URL` or `NEXTAUTH_URL` set to the staging URL
   - `CSP_REPORT_ONLY=1` (enable report-only to collect CSP violations)
   - `CF_TURNSTILE_SITEKEY` and `CF_TURNSTILE_SECRET` (staging/testing keys)
   - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
   - `REDIS_URL`
   - `NEXTAUTH_SECRET`
3. Deploy the `dev` branch build to staging:
   - `git checkout dev`
   - `npm ci`
   - `npm run build`
   - `npm run start` (or use PM2/systemd)
4. Apply DB migrations on staging:
   - `node scripts/apply_migration.js migrations/2026_03_10_add_auth_tables.sql`
   - `node scripts/apply_migration.js migrations/2026_03_11_admin_actions.sql`
   - `node scripts/apply_migration.js migrations/2026_03_12_csp_reports.sql`
5. Exercise key flows manually and via Playwright:
   - Sign-in (normal user)
   - Sign-in with 2FA (admin user)
   - Upload image flow and featured image render
   - Admin utilities: Locks, Login Attempts
   - Run Playwright tests: `npx playwright test --project=chromium`
6. Review CSP reports:
   - `node scripts/query_csp_reports.js`
   - `node scripts/analyze_csp_reports.js`
7. Iterate: update `next.config.js`/`next.config.ts` to remove any allowed `unsafe-*` directives required for staging flows, re-deploy and re-test until no critical violations.
8. When satisfied, set `CSP_REPORT_ONLY` to `0`/unset and deploy to production from `main` branch.
