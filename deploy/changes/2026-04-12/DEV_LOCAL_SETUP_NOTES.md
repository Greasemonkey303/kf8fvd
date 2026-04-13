Dev Local Setup Notes
=====================

Date: 2026-04-12

Purpose

- Record the local-development changes made to run the app directly on localhost instead of the Docker stack.
- Call out what must be restored or overridden before switching back to Docker-focused or production deployment.

What changed for local dev

- Added `.env.local` as a local mirror of the current `.env` so older maintenance scripts that still expect `.env.local` continue to work.
- Standardized local runtime assumptions around:
  - app origin: `http://localhost:3000`
  - internal app origin: `http://127.0.0.1:3000`
  - MySQL: `127.0.0.1:3306`
  - Redis: `127.0.0.1:6379`
  - MinIO: `127.0.0.1:9000`
- Updated the app metadata fallback so missing site URL env vars fall back to localhost instead of the production domain.
- Updated several maintenance scripts so they can read `.env` as well as `.env.local`.
- Changed the fallback Redis target in `scripts/list_rate_limiter_locks.js` from `host.docker.internal:6379` to `127.0.0.1:6379`.

Files changed in the repo

- `app/layout.tsx`
- `scripts/backend_readiness_check.js`
- `scripts/backup_restore_drill.js`
- `scripts/storage_orphan_audit.js`
- `scripts/lib/maintenance_run_logger.js`
- `scripts/run_tests_with_env.js`
- `scripts/list_rate_limiter_locks.js`
- `scripts/apply_migration.js`
- `scripts/check_pending_migrations.js`
- `scripts/abuse_monitor_report.js`
- `scripts/check_db_locks.js`
- `scripts/check_redis.js`
- `scripts/migrate_site_media_to_object_storage.js`
- `.env.local`

Values to change back or override before Docker-first use

- In local env files, these should not stay pointed at localhost if you switch back to Docker networking or production:
  - `NEXT_PUBLIC_SITE_URL`
  - `NEXTAUTH_URL`
  - `INTERNAL_APP_ORIGIN`
  - `DB_HOST`
  - `DB_PORT`
  - `REDIS_URL`
  - `MINIO_HOST`
  - `MINIO_PORT`
  - `NEXT_PUBLIC_MINIO_BASE_URL`
  - `UMAMI_SERVER_URL`
  - `NEXT_PUBLIC_UMAMI_HOST_URL`
  - `NEXT_PUBLIC_UMAMI_SCRIPT_URL`
- If you go back to Docker for app-to-app networking, the expected internal app origin is `http://kf8fvd:3000` and the Docker-specific host overrides should be used instead of direct localhost service addresses.

What does not need code rollback for production

- The script updates that read `.env` in addition to `.env.local` are safe to keep.
- The `app/layout.tsx` fallback to localhost only matters when production site URL env vars are missing; with proper production env set, no code rollback is needed.
- The Redis fallback change in `scripts/list_rate_limiter_locks.js` is only a fallback. In Docker or production, set `REDIS_URL` or `REDIS_HOST` explicitly.

Local verification completed

- `npm run readiness:backend` passed against MySQL, Redis, and MinIO using `.env`.
- `node scripts/backend_readiness_check.js --storage-write-test` passed, including MinIO write/delete verification.
- `node scripts/check_pending_migrations.js --json` reported zero pending or mismatched migrations.

Recommended rollback checklist before production or Docker deployment

1. Replace localhost URLs and ports in local env files with the correct deployment values.
2. Remove or ignore `.env.local` if you do not want local-only settings present on the target machine.
3. Verify `NEXT_PUBLIC_SITE_URL`, `NEXTAUTH_URL`, and `INTERNAL_APP_ORIGIN` match the deployment topology.
4. Verify DB, Redis, MinIO, and Umami env vars point to the correct runtime endpoints.
5. Re-run readiness checks in the target environment before deployment.