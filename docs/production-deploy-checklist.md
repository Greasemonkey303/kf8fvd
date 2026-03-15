# Production Deployment Checklist

Quick, actionable checklist for deploying the kf8fvd app to production.

## 1) Pre-deploy (local verification)
- **Build:** Run `npm run build` and fix any errors.
- **Tests:** Run unit tests and linters: `npx vitest` and `npm run lint`.
- **Smoke:** Start local production-like server and exercise admin flows:

```bash
# build
npm run build
# start (example: Node process or container)
NODE_ENV=production npm start
```

## 2) Required environment variables (production)
- **Authentication:** `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `NEXT_PUBLIC_SITE_URL`
- **Database:** `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- **Redis (required):** `REDIS_URL` (use `rediss://` for TLS). The rate limiter will throw if missing in production.
- **Storage:** `MINIO_HOST`/`MINIO_PORT`/`MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` or S3 equivalents.
- **Email:** `SENDGRID_API_KEY`, `SENDGRID_FROM` as needed.
- **Encryption:** `ENCRYPTION_KEY` and other secrets (store in secret manager).

Store all sensitive values in your cloud provider's secret manager (Key Vault, Secrets Manager, GitHub Secrets), do NOT commit to repo.

## 3) Database & migrations
- Apply migrations in `migrations/` before release. Ensure the following tables exist: `auth_locks`, `rate_limiter_counts`, `login_attempts`, and other admin tables used by the app.
- Take a DB backup/snapshot prior to running migrations.

## 4) Rate limiter & Redis
- **REDIS_URL** must be set in production. Use TLS where possible (`rediss://`).
- Tune the following env vars for production:
  - `RATE_WINDOW_MS` (window length)
  - `RATE_MAX` (max attempts per window)
  - `RATE_LOCK_MS` (lock duration on threshold)
- Confirm `lib/rateLimiter.ts` is pointing to Redis and that `auth_locks`/`rate_limiter_counts` migrations are applied for DB fallback.
- To clear a rogue lock (emergency):

```bash
# delete keys for IP (example ip -> 1.2.3.4)
redis-cli -h <host> -p <port> DEL "rl:count:ip%3A1.2.3.4" "rl:lock:ip%3A1.2.3.4"
```

## 5) Next.js specifics
- Ensure only `proxy.ts` is present (no `middleware.ts`). The app currently uses `proxy.ts` for admin gating.
- Set `NEXT_PUBLIC_SITE_URL` to your production domain.
- Configure image domains / `remotePatterns` if migrating to `next/image`.

## 6) Secrets & credentials
- Use a secret manager and rotate keys: `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`, `SENDGRID_API_KEY`, storage keys.

## 7) File storage & uploads
- If using MinIO in production, ensure it is secured (network restriction + TLS). Otherwise use S3 and update config.
- Set `NEXT_PUBLIC_MINIO_BASE_URL` appropriately.

## 8) Security & headers
- Confirm CSP, HSTS, and other security headers are active (app already sets CSP headers). Review `content-security-policy` values.
- Confirm Turnstile/Captcha secrets (`CF_TURNSTILE_SECRET`) are set.

## 9) Observability & monitoring
- Configure application logs, metrics and alerts (e.g., Prometheus, Application Insights, Sentry).
- Ensure metric prefix (`METRICS_PREFIX`) is set for production.

## 10) Deployment process
- CI pipeline should run: `npm ci`, `npm run lint`, `npm run build`, `npx vitest` and only then deploy artifacts.
- Use a reproducible deployment (container image or Next standalone build) and a process manager (systemd, PM2) or container orchestrator.

## 11) Post-deploy smoke checks
- Visit `/` and `/signin` to confirm pages render.
- Verify `/admin` redirects if unauthenticated and allows admins.
- Call `POST /api/mw/rate` to confirm rate limiter behavior is expected.

## 12) Rollback plan
- Have DB backups and a prior image or commit to roll back.

## 13) Checklist (quick tick-box)
- [ ] All env vars set in secrets manager
- [ ] Migrations applied and DB backup taken
- [ ] Redis is reachable and `REDIS_URL` set
- [ ] Build, tests, lint pass in CI
- [ ] Proxy/middleware config verified (`proxy.ts` only)
- [ ] Monitoring & alerts configured
- [ ] Post-deploy smoke tests pass

---

If you want, I can: (A) add a GitHub Actions workflow to run the build/tests, (B) create a Dockerfile/compose for production, or (C) run a live pre-production smoke run now.
