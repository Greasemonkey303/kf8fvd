# KF8FVD Production Deploy Runbook

This runbook is for deploying the current app without changing how it runs today.

## Deployment Invariants

- Keep the app runtime exactly as it is now: Next.js app on internal port `3000`, started by `node /usr/local/bin/docker-entrypoint.js`.
- Keep the production app container labeled `kf8fvd`.
- Keep `proxy.ts` as the root request gate. Do not reintroduce `middleware.ts`.
- Keep the existing auth flow: NextAuth credentials + JWT sessions + email 2FA + Turnstile.
- Keep the existing rate limiter: Redis first, DB-backed fallback tables present.
- Keep MinIO as the S3-compatible object store. The production bucket already exists as `kf8fvd`.
- Keep the production MySQL schema name as `kf8fvd`.
- Use Nginx and SSL certificates in production. Do not use local Caddy in production.
- Point the Cloudflare tunnel at Nginx, not directly at the app container.
- Do not change application logic unless a production validation step proves a real deployment blocker.

## Current Verified State

- `npm run build` passes.
- Local production-like Docker build passes.
- HTTPS smoke checks pass locally behind the reverse proxy.
- `/api/health` returns `200` when required production configuration is present.
- Unauthenticated `/admin` redirects to `/signin?callbackUrl=%2Fadmin`.
- The root request handler is already migrated to `proxy.ts`.

## What Must Exist Before First Production Start

- A MySQL schema named `kf8fvd`.
- A MinIO bucket named `kf8fvd`.
- Redis reachable from the app container.
- Nginx configured to proxy to the app container on port `3000`.
- SSL certificates already handled by the production proxy layer.
- Cloudflare tunnel already routed to the Nginx service.
- The SQL in [c:\Users\zachs\Documents\code\kf8fvd\deploy\kf8fvd-prduction-duildand-safe.sql](c:\Users\zachs\Documents\code\kf8fvd\deploy\kf8fvd-prduction-duildand-safe.sql) applied to the `kf8fvd` schema.

## Production Configuration

### Required Runtime Settings

These must be set for production.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | yes | Must be `production`. |
| `PORT` | yes | Keep `3000` inside the app container. |
| `NEXT_PUBLIC_SITE_URL` | yes | Public site origin used by metadata, links, CSP reporting, and auth flows. |
| `NEXTAUTH_URL` | yes | Must match the public HTTPS origin. |
| `NEXTAUTH_SECRET` | yes | Required by NextAuth and by the admin `whoami` JWT fallback. |
| `ENCRYPTION_KEY` | yes | Required by app encryption helpers in production. |
| `DB_HOST` | yes | MySQL host reachable from the app container. |
| `DB_PORT` | yes | MySQL port. |
| `DB_USER` | yes | MySQL user. |
| `DB_PASSWORD` | yes | MySQL password. |
| `DB_NAME` | yes | Keep `kf8fvd`. |
| `REDIS_URL` | yes | Redis connection string. Health checks expect Redis to be configured. |
| `NEXT_PUBLIC_S3_BUCKET` | yes | Keep `kf8fvd`. |
| `MINIO_HOST` or `MINIO_ENDPOINT` | yes | MinIO endpoint reachable from the app container. |
| `MINIO_PORT` | yes | MinIO API port. |
| `MINIO_USE_SSL` | yes | `1`/`true` when MinIO is exposed over TLS, otherwise `0`/`false` on an internal network. |
| `MINIO_ACCESS_KEY` | yes | MinIO access key. |
| `MINIO_SECRET_KEY` | yes | MinIO secret key. |
| `NEXT_PUBLIC_MINIO_BASE_URL` | yes | Public object base URL used by the UI when needed. |
| `CF_TURNSTILE_SECRET` | yes | Server-side Turnstile verification secret. |
| `NEXT_PUBLIC_CF_TURNSTILE_SITEKEY` | yes | Client-side Turnstile site key. |
| `SENDGRID_API_KEY` | yes | Required for contact form, forgot password, and 2FA email delivery. |
| `SENDGRID_FROM` | yes | Sender address for outbound mail. |
| `SENDGRID_TO` | yes | Contact form destination address. |
| `INTERNAL_APP_ORIGIN` | yes | Internal HTTP origin used by `proxy.ts` for self-calls. If the app container name is `kf8fvd`, set this to `http://kf8fvd:3000`. |
| `ADMIN_API_KEY` or `ADMIN_BASIC_USER` + `ADMIN_BASIC_PASSWORD` | yes | Required by `/api/health` and by admin utility endpoints protected outside the session flow. |

### Required Hardening Flags

These should be explicitly set for production so the runtime cannot drift into a debug configuration.

| Variable | Required Value |
| --- | --- |
| `CF_TURNSTILE_BYPASS` | `0` |
| `DEBUG_2FA` | `0` |
| `CSP_REPORT_ONLY` | `0` |
| `CSP_ALLOW_INLINE` | `0` |

### Recommended Runtime Settings

These are not strict blockers, but they should be decided before go-live.

| Variable | Purpose |
| --- | --- |
| `S3_UPLOAD_PREFIX` | Defaults to `projects/`. Controls upload key prefixes. |
| `MAX_UPLOAD_BYTES` | Upload size limit for general uploads. |
| `MAX_UPLOAD_SIZE` | Upload size limit for call log imports. |
| `DB_CONNECTION_LIMIT` | MySQL pool size. |
| `RATE_WINDOW_MS` | Global rate-limit window. |
| `RATE_MAX` | Global rate-limit threshold. |
| `RATE_LOCK_MS` | Global lock duration. |
| `ADMIN_RATE_WINDOW_MS` | Admin gate window. |
| `ADMIN_RATE_MAX` | Admin gate threshold. |
| `ADMIN_RATE_LOCK_MS` | Admin gate lock duration. |
| `METRICS_PREFIX` | Metrics namespace prefix. |
| `METRICS_TTL_SEC` | Metrics retention in Redis. |
| `LOGBOOK_PROVIDER` | Optional logbook provider override. |
| `LOGBOOK_URL` | Required only for the custom logbook provider. |
| `LOGBOOK_API_KEY` | Required only for the custom logbook provider. |
| `QRZ_API_KEY` | Optional QRZ XML session key. |
| `QRZ_USERNAME` | Optional QRZ username-based login fallback. |
| `QRZ_PASSWORD` | Optional QRZ password-based login fallback. |
| `SIEM_ENDPOINT` | Optional admin action shipping endpoint. |
| `SIEM_API_KEY` | Optional admin action shipping API key. |
| `SHIPPER_POLL_MS` | Optional admin action shipper poll interval. |

## Build and Secret Handling

### Build-Time Secret Mounts Already Supported by the Dockerfile

The current Dockerfile already supports these BuildKit secrets:

- `nextauth_secret`
- `encryption_key`
- `db_password`
- `redis_url`

Build with BuildKit enabled and keep those values out of image layers.

### Runtime Secret Files Already Supported by the Entrypoint

The current `scripts/docker-entrypoint.js` reads these runtime secret files from `/run/secrets`:

- `nextauth_secret`
- `encryption_key`
- `db_password`
- `redis_url`

Only those four are read from `/run/secrets` automatically. Everything else must still be supplied as normal environment variables.

## Reverse Proxy Requirements

The app expects Nginx to forward requests to the app container over HTTP and preserve the forwarding headers.

Nginx must forward at least these headers:

- `Host`
- `X-Forwarded-For`
- `X-Real-IP`
- `X-Forwarded-Proto`

Minimum upstream behavior:

```nginx
location / {
    proxy_pass http://kf8fvd:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
}
```

Important:

- `INTERNAL_APP_ORIGIN` must stay on the internal Docker network and must not point to the public HTTPS URL.
- The admin proxy logic is designed to call `http://127.0.0.1:3000` or the configured internal origin, not the public reverse proxy.

## Production Container Expectations

When you integrate the app into the production Compose stack later:

- Use `kf8fvd` as the app service/container name.
- Keep the app container listening on `3000` internally.
- Do not expose `3000` publicly if Nginx is on the same Docker network.
- Keep the current Dockerfile and entrypoint behavior unchanged.
- Remove the local-only Caddy layer from the production stack.
- Do not mount the development bind volume for `scripts/docker-entrypoint.js` in production.

## Database Setup

Apply [c:\Users\zachs\Documents\code\kf8fvd\deploy\kf8fvd-prduction-duildand-safe.sql](c:\Users\zachs\Documents\code\kf8fvd\deploy\kf8fvd-prduction-duildand-safe.sql) in MySQL Workbench against the already-created `kf8fvd` schema.

That SQL file is the export-derived schema-only build for production use. It does not seed demo content and it does not create the first admin user.

After the schema is in place, use [c:\Users\zachs\Documents\code\kf8fvd\deploy\FIRST_ADMIN_USER.txt](c:\Users\zachs\Documents\code\kf8fvd\deploy\FIRST_ADMIN_USER.txt) to create the initial administrator.

## MinIO Notes

- The production bucket already exists as `kf8fvd`.
- The app expects `NEXT_PUBLIC_S3_BUCKET=kf8fvd`.
- Object operations use the MinIO S3-compatible API from the app container.
- If browser-direct presigned upload flows are used in production, configure bucket CORS before go-live. The repo already contains `scripts/set-minio-cors.js` for that purpose.

## Deployment Order

1. Apply the production schema SQL to `kf8fvd` in MySQL Workbench.
2. Prepare production environment variables and secret mounts.
3. Build the image with BuildKit secrets using the current Dockerfile.
4. Start the app container as `kf8fvd` on the internal Docker network.
5. Attach Nginx to the same network and proxy HTTPS traffic to `http://kf8fvd:3000`.
6. Point the Cloudflare tunnel at Nginx.
7. Create the first admin user.
8. Run post-deploy smoke validation.

## Post-Deploy Smoke Validation

Run these checks after the stack is up:

1. `GET /api/health` returns `200`.
2. `GET /signin` loads and the Turnstile widget appears.
3. `GET /admin` when signed out redirects to `/signin?callbackUrl=%2Fadmin`.
4. A valid login with email, password, and 2FA succeeds.
5. After login, `GET /api/admin/whoami` returns `admin: true` for the admin account.
6. The admin dashboard loads.
7. At least one upload path works against MinIO.
8. Contact form submission stores a row in `messages` and delivers mail through SendGrid.
9. Forgot-password email flow works.
10. Failed admin requests increment the admin rate limiter and do not break normal authenticated admin navigation.

## Health Check Expectations

`/api/health` fails if any of these are missing:

- `NEXTAUTH_SECRET`
- `NEXT_PUBLIC_S3_BUCKET`
- `DB_HOST`
- `DB_USER`
- `DB_NAME`
- `REDIS_URL`
- one admin auth method (`ADMIN_API_KEY` or `ADMIN_BASIC_USER` + `ADMIN_BASIC_PASSWORD`)

Use that endpoint as the first readiness check after the app container starts.

## First-Run Operational Notes

- The first reverse-proxy check can briefly return `502` if Nginx checks the app before `next start` is ready. Recheck after startup completes.
- The app uses MySQL over TLS settings in production with `rejectUnauthorized: false`. Keep DB access on a trusted private network or managed TLS endpoint.
- The app logs enough startup detail to confirm whether DB and auth configuration are present without printing secret contents.

## Recommended After Go-Live

These are not blockers for deployment, but they should be tracked next:

1. Pin the Wolfi base image by digest instead of `latest`.
2. Clean up the npm config warnings emitted at container startup.
3. Add an automated production smoke script that runs against the live HTTPS origin.
