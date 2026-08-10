# KF8FVD Upgrade Plan

Audit date: 2026-08-09
Last production verification: 2026-08-10

This document records the findings from a read-only review of the application,
its production containers, CI workflows, security boundaries, data paths, and
rendered desktop/mobile experience. Do not place secrets, passwords, tokens, or
private contact data in this file.

## Implementation Status

P0-P2 implementation was completed and deployed on 2026-08-09 as
`kf8fvd-app:upgrade-2026-08-09`.

Completed work includes:

- Public redirect loop repaired; canonical routing reaches `200` with zero
  redirects, while public admin and mutation routes remain protected.
- Exposed test password invalidated, reset email issued, credential literals
  removed, `NEXTAUTH_SECRET` rotated, and JWT session versioning deployed.
- Upload signing requires admin authorization; raster MIME, extension, size,
  destination, and magic bytes are verified; SVG/active content is rejected.
- Public media is prefix-allowlisted, private object prefixes return `404`, and
  media responses stream with ETag, `HEAD`, and byte-range support.
- Direct and transitive npm audit findings reduced to zero; Next.js, NextAuth,
  Sharp, DOMPurify, storage clients, Vitest, and lint tooling were upgraded.
- CI was consolidated around Node 20 with audit, secret/misconfiguration scan,
  lint, typecheck, coverage, tests, build, Redis integration, image scan, and
  staging Playwright workflows.
- Lint and TypeScript are clean. The no-service test run passes 57 tests with one
  explicit Redis skip; that Redis concurrency test also passes against an
  isolated Redis container.
- Critical-helper coverage passes at 66% statements, 58% branches, 73%
  functions, and 74% lines.
- The production standalone image runs as non-root, contains no embedded secret
  variables/history, has zero fixed high/critical Trivy findings, and is roughly
  65% smaller than the previous image.
- All 20 migrations are checksum-recorded with zero pending/mismatched files.
  Session revocation, deletion cleanup state, operational indexes, and the
  featured-image invariant were restore-tested before production application.
- Content deletion is database-first with durable pending cleanup and an
  authenticated retry endpoint. The cleanup queue is currently empty.
- Logbook diagnostics/raw session responses and mock QSOs were removed; custom
  providers require an explicit HTTPS origin allowlist and bounded responses.
- Mobile overflow and the closed-menu layout gap are fixed; root Back control,
  duplicate font loading, global Turnstile loading, and application-owned
  homepage style attributes were removed.
- Error/loading/404 boundaries, robots, sitemap, manifest, canonical metadata,
  meaningful hero labels, and responsive browser coverage were added.
- Daily local three-store backups and weekly operational retention are active as
  user-level systemd timers. The backup uses one checksum-verified rolling mirror
  under `/opt/kf8fvd/data/rolling-backup/current`; a repeat run transferred only
  110 KB of changed database/metadata files and retained unchanged media in
  place. Final restore checks matched all 26 MySQL tables and all 14 Umami
  PostgreSQL tables; all nine MinIO object checksums passed.
- Generated root captures/reports were removed and ignored.

## External Follow-ups

These actions require owner/external infrastructure and cannot be completed by
repository code alone:

- [ ] Use the one-time reset email to choose the new admin password. The exposed
  password is already invalid and cannot authenticate.
- [ ] Mount an off-host backup destination and run
  `scripts/configure_offsite_backup.sh /mounted/offsite/kf8fvd`. Daily verified
  local rolling backups are active until that mount is supplied; the same-disk
  mirror is not disaster recovery.
- [ ] If the repository was shared or mirrored, coordinate a Git history rewrite
  and force-push to remove the old credential from historical commits. Rotation
  has already removed its authentication value.
- [ ] Enter a dedicated staging account through
  `scripts/configure_staging_auth_secrets.sh` before manually enabling
  state-changing Playwright auth tests. The GitHub `staging` environment and its
  non-sensitive `SITE_URL` variable are already configured.

## Current Verified State

- Public production smoke gate passes every routing/security assertion.
- App, MySQL, Redis, MinIO, proxy, Umami, Umami PostgreSQL, and tunnel are
  running; configured service health checks are healthy.
- Backend readiness passes MySQL, Redis, and MinIO write/stat/delete verification.
- Storage audit reports nine database references, nine bucket objects, zero
  missing references, and zero unreferenced objects.
- Operational retention preview is clean after applying expired OTP/CSP cleanup.
- `.env` is owner-readable only (`0600`), and the custom plus Trivy secret scans
  pass.
- The daily backup and weekly cleanup timers are active. The backup service
  succeeds with a checksum-valid owner-only (`0700`) rolling mirror and zero
  retained timestamp directories.
- The release baseline passes 57 Vitest tests, the isolated Redis concurrency
  test, nine Chromium/Firefox/mobile Playwright tests, coverage thresholds,
  TypeScript, ESLint, the production build, npm audit, and the public smoke gate.

## P0-P2 Closure Checklist

- [x] P0-P2 repository and runtime implementation completed.
- [x] Production image deployed with a retained rollback image.
- [x] All 20 migrations applied and checksum-recorded.
- [x] MySQL, MinIO, and Umami PostgreSQL restores verified.
- [x] Production routes, headers, private-media boundaries, and health verified.
- [x] Daily rolling backup and weekly operational cleanup timers verified.
- [x] Generated root artifacts and temporary audit resources removed.

The detailed P0-P3 sections below retain the original audit wording and
acceptance criteria for traceability. Their original unchecked markers are not
the active task list; current open work is listed only under **External
Follow-ups** above.

## Priority Definitions

- **P0**: Resolve before restoring or changing the public production route.
- **P1**: Resolve in the next maintenance cycle.
- **P2**: Schedule after the production and security baseline is green.
- **P3**: Maintainability, performance, and content improvements.

## P0: Immediate Production and Security Work

### 1. Repair the public redirect loop

At audit time, `https://www.kf8fvd.com/` repeatedly returned `301` with the same
URL in the `Location` header. The app itself remained healthy on localhost.
Tunnel logs showed the Cloudflare origin as `http://proxy:80`, while the HTTP
virtual host in [`nginx.conf`](nginx.conf) unconditionally redirects to the
public HTTPS URL.

- [ ] Choose one supported origin design:
  - Point Cloudflare Tunnel to the Nginx HTTPS listener and configure origin
    certificate validation correctly; or
  - Keep the private tunnel origin on HTTP and proxy trusted tunnel traffic to
    the app instead of redirecting it back through Cloudflare.
- [ ] Preserve the canonical redirect from `kf8fvd.com` to
  `www.kf8fvd.com` without redirecting `www` to itself.
- [ ] Add a smoke check that fails on loops and verifies a final `200` response.
- [ ] Verify `/`, `/signin`, `/contactme`, and a static asset through the public
  hostname after the change.
- [ ] Verify public `/admin` and `/api/admin/*` still return `404`.

Done when `curl -L --max-redirs 5 https://www.kf8fvd.com/` reaches a final
`200` without revisiting the same URL.

### 2. Rotate and remove the tracked test credential

[`tests/playwright/auth.spec.ts`](tests/playwright/auth.spec.ts) contains a
hard-coded fallback login identity and password. The value is intentionally not
repeated here. Treat it as compromised even if the repository is private.

- [ ] Rotate the affected account password immediately.
- [ ] Rotate `NEXTAUTH_SECRET` during a controlled restart to invalidate
  existing JWT sessions.
- [ ] Remove all credential fallback literals from Playwright tests.
- [ ] Require `PLAYWRIGHT_TEST_EMAIL` and `PLAYWRIGHT_TEST_PASSWORD`; skip or
  fail clearly when they are absent.
- [ ] Remove the credential from Git history if the repository has been shared,
  mirrored, or made public.
- [ ] Add a maintained scanner such as Gitleaks to CI.
- [ ] Expand [`tools/scan-secrets.js`](tools/scan-secrets.js) to detect quoted
  password/token fallbacks and scan files larger than 1 MB safely.

Done when the old credential no longer authenticates, no tracked revision used
for deployment contains it, and CI rejects a representative test credential.

### 3. Remove or protect the unauthenticated upload signer

[`app/api/uploads/presign-post/route.ts`](app/api/uploads/presign-post/route.ts)
returns an upload policy without calling `requireAdmin()`. It is excluded from
the proxy middleware with the other upload routes and is not explicitly blocked
by Nginx. An unauthenticated request returned `200` during the audit. No current
frontend caller was found, so this appears to be a legacy endpoint.

- [ ] Delete the route if it is unused.
- [ ] Otherwise require an authenticated administrator in the route itself.
- [ ] Add a strict content-length policy.
- [ ] Allow only required raster formats by verified file signature.
- [ ] Exclude SVG, HTML, XML, and arbitrary `image/*` subtypes.
- [ ] Restrict upload prefixes server-side; do not accept arbitrary destinations.
- [ ] Block all admin upload mutation routes at the public Nginx boundary as
  defense in depth.
- [ ] Add unauthenticated `401/404` and oversize-upload tests.

### 4. Separate public media from private objects

[`app/api/uploads/get/[...key]/route.ts`](app/api/uploads/get/%5B...key%5D/route.ts)
accepts any object key and reads it with server-side MinIO credentials. The same
bucket also stores private `messages/` attachments, `trash/` archives,
`healthchecks/`, and restore-drill objects. Knowledge of a private key would
bypass the authenticated message attachment handler.

- [ ] Define a public prefix allowlist such as `hero/`, `about/`, `projects/`,
  `pages/`, and explicitly approved credential media.
- [ ] Reject `messages/`, `trash/`, `healthchecks/`, `restore-drills/`, backup,
  and unknown prefixes from all public media handlers.
- [ ] Keep contact attachments behind
  [`app/api/admin/messages/attachments/route.ts`](app/api/admin/messages/attachments/route.ts).
- [ ] Prefer separate public and private buckets with separate credentials.
- [ ] Stream object responses instead of buffering complete objects in memory.
- [ ] Use stored object metadata for content type rather than trusting only the
  filename extension.
- [ ] Add `X-Content-Type-Options: nosniff` and safe `Content-Disposition`
  behavior.
- [ ] Add tests proving private prefixes cannot be retrieved publicly.

### 5. Remove same-origin active-content upload risk

The upload routes permit `image/svg+xml`, and the public download route serves
`.svg` as `image/svg+xml` without forcing download. Active SVG content served
from the application origin can become stored XSS.

- [ ] Remove SVG from user/admin upload allowlists unless there is a documented
  need.
- [ ] If SVG must be accepted, sanitize it with a purpose-built SVG policy and
  serve it from a cookieless media origin.
- [ ] Never serve uploaded HTML/XML/SVG inline from the authenticated app origin.
- [ ] Validate extension, declared MIME type, and file signature together.

### 6. Patch production dependencies in staging

`npm audit --package-lock-only --omit=dev` reported 19 production advisories:
1 critical, 12 high, 5 moderate, and 1 low. Directly affected packages include
Next.js, NextAuth, Sharp, and DOMPurify. Important transitive findings included
Undici, PostCSS, XML parsers, Axios, and WebSocket packages.

- [ ] Create a backup and a dedicated dependency-upgrade branch.
- [ ] Upgrade Next.js from `16.1.6` to the current patched stable release.
- [ ] Upgrade NextAuth/Auth.js to a release that resolves current advisories.
- [ ] Upgrade Sharp/libvips and test the WebP/AVIF pipeline.
- [ ] Upgrade DOMPurify and rerun stored-content sanitization tests.
- [ ] Apply non-breaking transitive fixes first.
- [ ] Review breaking upgrades individually; do not use an unreviewed
  `npm audit fix --force` on production.
- [ ] Rebuild the container from a clean lockfile and scan the final image.
- [ ] Repeat `npm audit --omit=dev` until remaining exceptions are documented.

### 7. Verify recoverable, off-host backups

No scheduled/off-host backup definition was visible in the repository, and no
`data/backups` directory existed at audit time. MySQL and MinIO together held
about 200 MB of local data. The existing backup script does not cover the Umami
PostgreSQL volume.

- [ ] Confirm whether an external backup system already exists.
- [ ] Take a MySQL and MinIO snapshot before P0 changes.
- [ ] Add Umami PostgreSQL backup and restore coverage.
- [ ] Store backups on a different host/provider, not only under `/opt/kf8fvd`.
- [ ] Define retention, encryption, RPO, RTO, and alert ownership.
- [ ] Schedule snapshot backups and periodic full restore drills.
- [ ] Record the last successful backup and restore test in monitoring.

## P1: Reliability and Release Baseline

### 8. Repair and consolidate GitHub Actions

- [ ] Split the two root workflows concatenated in
  [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
- [ ] Remove overlapping CI definitions or give each one a single purpose.
- [x] Replaced Node 18 with Node 20 in the consolidated
  [`.github/workflows/ci.yml`](.github/workflows/ci.yml) and
  [`.github/workflows/playwright.yml`](.github/workflows/playwright.yml).
- [ ] Pin third-party actions to maintained versions or commit SHAs.
- [ ] Make lint, typecheck, all Vitest suites, build, secret scan, dependency
  audit, and image scan required checks on the protected branch.
- [ ] Provide isolated MySQL and Redis test services with test-only credentials.
- [ ] Do not make repository secret presence a requirement for untrusted fork
  pull requests; use environment-scoped deployment checks.
- [ ] Add workflow linting with `actionlint`.

### 9. Make script names and test scope truthful

The current scripts have overlapping behavior:

- `npm test` loads a local env file and runs only `tests/unit`.
- `npm run test:unit` runs Vitest's configured unit and integration patterns.
- The release verifier labels `test:unit` as unit and integration tests.
- `tests/sanitize.test.ts` is outside the configured include patterns.

- [ ] Add explicit `test:unit`, `test:integration`, `test:e2e`, and `test:all`
  scripts.
- [ ] Make tests independent of a developer `.env.local` file.
- [ ] Include or relocate `tests/sanitize.test.ts`.
- [ ] Make service-dependent tests skip clearly or start dedicated services.
- [ ] Keep production database and Redis credentials unavailable to all tests.

### 10. Restore a green static-analysis and test baseline

Audit results from read-only isolated containers:

- ESLint: 4 errors and 3 warnings.
- TypeScript: 2 errors in tests assigning to read-only `NODE_ENV` types.
- Vitest: 7 files passed and 2 failed; output reported 17 passing tests and 2
  failing tests, plus a Redis hook timeout without a test Redis service.
- The destructive-flow failures expected string IDs while handlers now use
  validated numeric IDs.

- [ ] Remove prop-to-state synchronization effects flagged in
  [`app/admin/AdminPageClient.tsx`](app/admin/AdminPageClient.tsx) and
  [`app/admin/utilities/monitoring/MonitoringPageClient.tsx`](app/admin/utilities/monitoring/MonitoringPageClient.tsx).
- [ ] Remove or use the three unused values reported by ESLint.
- [ ] Update test environment assignment typing.
- [ ] Update destructive-flow assertions to the intended numeric contract.
- [ ] Run Redis integration tests against an isolated Redis container.
- [ ] Add coverage reporting and a modest initial threshold for critical modules.

### 11. Add a real production smoke gate

- [ ] Check that the public origin reaches a final `200` without loops.
- [ ] Validate canonical-host redirects.
- [ ] Validate CSP, HSTS, `nosniff`, frame protections, and cache headers.
- [ ] Validate that public admin and mutation routes remain hidden.
- [ ] Validate that private object prefixes return `404` publicly.
- [ ] Validate sign-in, 2FA request, contact submission, and password reset in a
  staging environment with test-specific provider credentials.
- [ ] Run Chromium plus one mobile viewport at minimum.

## P1: Authentication and Abuse Controls

### 12. Remove implicit development authorization bypasses

- [x] Removed the unused `app/api/uploads/direct-json/route.ts` development
  upload route entirely.
- [ ] Remove the development utility-admin fallback from [`lib/auth.ts`](lib/auth.ts).
- [ ] Remove request-body `_bypass` and `_debug` controls from the 2FA route.
- [ ] Use explicit test dependency injection or test-only fixtures instead of
  behavior selected by `NODE_ENV`.
- [ ] Add tests proving staging-like deployments cannot enable bypasses.

### 13. Make Turnstile fail closed in production

[`lib/turnstile.ts`](lib/turnstile.ts) returns success when no secret is
configured. The active production environment had a secret, but readiness does
not currently require it.

- [ ] Fail startup/readiness when production Turnstile variables are absent.
- [ ] Return verification failure when the production secret is unavailable.
- [ ] Validate expected hostname and action fields from Turnstile responses.
- [ ] Keep bypass capability out of production bundles and request bodies.

### 14. Harden 2FA and session revocation

- [ ] Generate codes with `crypto.randomInt()` rather than `Math.random()`.
- [ ] Invalidate earlier unused codes when issuing a replacement.
- [ ] Add a resend cooldown and per-account send limit.
- [ ] Do not clear OTP failure counters merely because the password was valid.
- [ ] Await rate-limit reset operations and handle their failures explicitly.
- [ ] Add a user token/session version so password resets and security changes
  invalidate existing JWT sessions.
- [ ] Test OTP replay, expiry, replacement, brute-force lockout, and email flood
  behavior.

### 15. Minimize public diagnostic disclosure

- [ ] Replace the public health body with a minimal liveness response.
- [ ] Put dependency names, latency, missing configuration, and raw errors behind
  operator authentication or localhost access.
- [ ] Remove production stack traces and backend error text from upload responses.
- [ ] Keep structured internal logs, but redact object keys and personal data
  where they are not operationally necessary.

## P1: Frontend and CSP Corrections

### 16. Fix the mobile navigation layout

The closed mobile menu in
[`components/navbar/navbar.module.css`](components/navbar/navbar.module.css)
uses opacity and pointer-events but still occupies layout space. At a nominal
390 x 844 viewport, the measured layout viewport was 375 px wide and the header
was about 482 px tall before the hero began.

- [ ] Use `display: none`, `visibility` with removed layout space, or a properly
  positioned disclosure panel while closed.
- [ ] Preserve focus management, Escape handling, and `aria-expanded` behavior.
- [ ] Add mobile E2E assertions for header and hero positions.

### 17. Remove homepage horizontal overflow

[`containers/hero/hero.module.css`](containers/hero/hero.module.css) sets the
hero to `100vw` inside a padded main element and uses a negative viewport margin.
The rendered mobile document measured 383 px of content in a 375 px viewport.

- [ ] Replace viewport breakout math with a full-bleed layout that accounts for
  the parent padding, or remove the parent padding for the hero section.
- [ ] Assert `scrollWidth === clientWidth` at desktop and mobile widths.
- [ ] Recheck the animated image scale so it cannot create scroll overflow.

### 18. Stop mounting the Back button globally

- [ ] Remove [`BackButton`](components/back/BackButton.tsx) from the root layout.
- [ ] Add contextual back navigation only on detail/admin pages that need it.
- [ ] Use a normal link fallback when browser history is empty.
- [ ] Ensure the control cannot cover mobile content.

### 19. Resolve enforced CSP style violations

Browser testing produced repeated violations because production `style-src`
does not permit style attributes. The codebase contains numerous JSX `style`
props on public auth, contact, credentials, projects, toast, and admin surfaces.

- [ ] Move fixed inline styles to CSS modules/classes.
- [ ] Replace dynamic style widths with native `<progress>`, data attributes, or
  a nonce-bearing stylesheet strategy that does not require `unsafe-inline`.
- [ ] Keep production scripts nonce-based.
- [ ] Exercise all public forms with CSP enforcement and fail E2E on console CSP
  errors.
- [ ] Keep `CSP_REPORT_ONLY=1` only for staged policy changes.

### 20. Keep one source of Next.js configuration

The audit found conflicting `next.config.js` and
[`next.config.ts`](next.config.ts) files. The JavaScript file was removed; the
TypeScript config now owns invariant headers/images while [`proxy.ts`](proxy.ts)
owns the per-request nonce CSP.

- [ ] Consolidate into one configuration file.
- [ ] Keep per-request CSP policy ownership in one place, preferably
  [`proxy.ts`](proxy.ts).
- [ ] Remove production localhost origins and `ws:`/`wss:` from `connect-src`
  unless a real production feature requires them.
- [ ] Remove unused external origins such as `unpkg.com` after verifying usage.
- [ ] Document how nonce-bearing scripts and styles are authored.

### 21. Improve global loading cost and navigation state

- [ ] Load Cloudflare Turnstile only on forms that use it, not every page.
- [ ] Remove duplicate Google font imports when `next/font` already supplies
  fonts, then standardize the typography tokens.
- [ ] Move navbar session resolution to the server or share the existing
  NextAuth session provider instead of fetching `/api/auth/session` separately.
- [ ] Remove unnecessary client-component boundaries from admin pages as they
  are touched; do not perform a broad rewrite without measurements.

## P1: Deployment and Operations

### 22. Remove unsafe defaults and pin images

- [ ] Remove `change-me` defaults for Umami PostgreSQL and `APP_SECRET` from
  [`docker-compose.yml`](docker-compose.yml); fail startup when absent.
- [ ] Pin MinIO, Umami, Nginx, and Wolfi images to reviewed versions/digests.
- [ ] Tag the app image by release or Git SHA instead of only `latest`.
- [ ] Enable automated update pull requests without automatic production
  deployment.

### 23. Keep secrets out of Docker build arguments

The Dockerfile supports BuildKit secret mounts, but Compose also passes database,
Redis, auth, and encryption values as build arguments.

- [ ] Remove secret-valued build arguments from Compose and the Dockerfile.
- [ ] Declare BuildKit build secrets explicitly in Compose.
- [ ] Supply runtime secrets only at container start.
- [ ] Remove the `.env.docker` exception from `.dockerignore` unless a reviewed,
  non-secret generated file is genuinely required.
- [ ] Inspect image history and provenance after rebuilding.

### 24. Add health checks and startup ordering

- [ ] Add an app readiness health check against `/api/health` or a private
  readiness endpoint.
- [ ] Add MinIO liveness/readiness checks.
- [ ] Add proxy and Umami checks.
- [ ] Monitor Cloudflare tunnel connectivity rather than relying only on process
  state.
- [ ] Use health-based `depends_on` conditions where startup order matters.
- [ ] Alert on public smoke failure even when every container is still running.

### 25. Reduce image size and improve process handling

- [ ] Use Next.js standalone output or prune development dependencies from the
  runtime image.
- [ ] Forward `SIGTERM`/`SIGINT` from the Node entrypoint to the child process and
  verify graceful shutdown.
- [ ] Reduce or remove the five-second heartbeat log once health checks exist.
- [ ] Consider a read-only root filesystem and explicit writable temp mounts.
- [ ] Add CPU limits only after measuring normal and peak usage.

## P2: Data Integrity and Storage

### 26. Make cross-system deletion recoverable

Credential, page, and project deletion archives and removes MinIO objects before
the final database delete. If that SQL delete fails, a live row can point to
already-removed media. MySQL and MinIO cannot share one transaction.

- [ ] Add a database deletion state and durable cleanup/outbox record.
- [ ] Commit the database state first, then process object deletion idempotently.
- [ ] Track retries and partial failures.
- [ ] Provide an operator restore/reconcile action using the trash archive.
- [ ] Add failure-injection tests after each step.

### 27. Validate all object keys at one boundary

- [ ] Normalize and validate keys after resolving legacy URL formats.
- [ ] Reject leading slashes, `..`, encoded traversal, control characters, and
  unknown prefixes.
- [ ] Apply the same key policy to read, write, archive, delete, and migration
  utilities.
- [ ] Add adversarial unit tests for encoded and mixed URL/key forms.

### 28. Make featured-image and slug writes atomic

- [ ] Put hero featured-image selection in a transaction or enforce the
  one-featured-image invariant in the data model.
- [ ] Replace check-then-insert page slug logic with an atomic upsert or locked
  transaction.
- [ ] Add concurrent-request tests for both paths.

### 29. Make audit logging failures observable

- [ ] Stop silently succeeding when every backward-compatible
  `admin_actions` insert attempt fails.
- [ ] Emit a metric/alert for audit-write failure.
- [ ] Keep request success/failure behavior explicit for high-risk admin actions.
- [ ] Remove old insert fallbacks after every environment has the current schema.

### 30. Review database capacity with measurements

- [ ] Add query/connect timeouts and bounded queue behavior to the MySQL pool.
- [ ] Monitor pool saturation and slow queries.
- [ ] Use `EXPLAIN` and production-sized staging data before adding indexes.
- [ ] Review time-window queries for login attempts, rate-limit cleanup, CSP
  reports, call logs, and admin actions.
- [ ] Add retention jobs for tables that grow continuously.

### 31. Add encryption-key versioning

- [ ] Store a key version with encrypted values.
- [ ] Support decrypt-with-old/encrypt-with-current during rotation.
- [ ] Add a controlled re-encryption utility and tested rollback procedure.
- [ ] Document emergency rotation steps without recording key material.

## P2: Public Content, SEO, and UX

### 32. Replace mock content presented as live data

At audit time, `/api/logbook` returned three hard-coded mock contacts, and the
dashboard contained hard-coded upcoming events including a past March date.

- [ ] Connect Recent QSOs to the real call log/QRZ source or show an honest
  unavailable/empty state.
- [ ] Move nets and events to managed data with dates and expiry behavior.
- [ ] Do not label mock or stale data as live.
- [ ] Add a visible last-updated time for station and propagation data.

### 33. Simplify and secure the logbook route

- [ ] Remove public `?diag=1` environment-presence output.
- [ ] Never return upstream XML fragments, raw responses, or session-bearing
  request URLs to clients.
- [ ] Allowlist custom provider origins and require HTTPS in production.
- [ ] Add timeouts, caching, response-size limits, and per-IP rate limiting.
- [ ] Use a maintained XML parser with entity expansion disabled rather than
  repeated regular expressions.
- [ ] Return one stable, typed response shape for DB, QRZ, and empty states.

### 34. Add App Router failure and discovery files

- [ ] Add root and admin `error.tsx` boundaries.
- [ ] Add useful loading states where navigation can wait on data.
- [ ] Add a branded `not-found.tsx`.
- [ ] Add `robots.ts`, `sitemap.ts`, and a web manifest.
- [ ] Add canonical URL metadata and verify the configured `www` origin.
- [ ] Change the homepage H1 from generic managed text such as "Home Hero" to
  the callsign/site identity.
- [ ] Replace filename-like hero alt text with meaningful content or empty alt
  when the image is decorative.

### 35. Improve media delivery

- [ ] Stream media and avoid recomputing a full-buffer SHA-1 on every request.
- [ ] Persist ETag/content metadata from MinIO and support `HEAD`/range requests
  where useful.
- [ ] Set caching based on immutable versioned keys rather than assuming every
  object key is immutable.
- [ ] Continue generating WebP/AVIF variants and test fallback behavior.
- [ ] Measure hero transfer size and Largest Contentful Paint on mobile.

## P2: Test Coverage

- [ ] Add security tests for unauthenticated upload signing and private-object
  retrieval.
- [ ] Add CSRF/origin tests for state-changing admin routes.
- [ ] Add XSS tests for stored rich text and uploaded media.
- [ ] Add 2FA replay, resend, expiry, and session-revocation tests.
- [ ] Add contact attachment authorization and size/type tests.
- [ ] Add archive/delete partial-failure tests.
- [ ] Add public redirect and security-header tests.
- [ ] Add Chromium, Firefox, and mobile viewport projects after the core suite is
  deterministic.
- [ ] Make E2E assertions fail on API errors rather than accepting missing
  `ok` fields.
- [ ] Remove tests that silently skip the behavior they claim to verify.

## P3: Documentation and Repository Cleanup

- [ ] Keep [`README.md`](README.md) aligned with the eight-service Compose stack.
- [x] Removed stale Windows paths from
  [`docs/PRODUCTION_DEPLOY_RUNBOOK.md`](docs/PRODUCTION_DEPLOY_RUNBOOK.md).
- [ ] Replace bootstrap/Vercel guidance with the actual self-hosted deployment
  path.
- [ ] Document the Cloudflare tunnel origin contract and canonical redirect.
- [ ] Document backup frequency, retention, RPO/RTO, and restore ownership.
- [ ] Document dependency update and emergency security patch policy.
- [x] Removed tracked diagnostic output including root HTML captures, presign
  responses, `eslint_report.json`, `qrz.xml`, and the approximately 2.38 MB
  `body.json` file; matching ignore rules now prevent regeneration churn.
- [ ] Remove unused duplicate logos only after confirming no external references.
- [x] Removed unused Caddy and incomplete distroless configuration.

## Existing Strengths to Preserve

- Parameterized database queries are used consistently in primary routes.
- Rich HTML has centralized server-side sanitization.
- Password reset tokens are hashed, and password breach checks exist.
- Email 2FA codes are hashed at rest and expire.
- Rate limiting has Redis, database, and memory fallbacks.
- Admin pages and APIs are blocked at the public Nginx boundary.
- Admin APIs generally perform route-level authorization as well.
- Security headers include CSP, HSTS, frame denial, `nosniff`, referrer policy,
  and a restrictive permissions policy.
- Containers drop Linux capabilities, use `no-new-privileges`, bind service
  ports to localhost, isolate traffic on a bridge network, and rotate logs.
- Backup/restore, migration, storage audit, abuse monitoring, structured logging,
  and release verification utilities already exist.
- The rendered site has a skip link, semantic landmarks, responsive navigation,
  modern image variants, and useful admin/content functionality.

## Recommended Implementation Order

1. Take and verify off-host backups.
2. Rotate the tracked credential and invalidate sessions.
3. Close upload signing and private-object access.
4. Patch critical/high production dependencies in staging.
5. Repair the tunnel/Nginx route and run public smoke checks.
6. Repair CI, lint, typecheck, and tests.
7. Fix mobile layout and enforced CSP violations.
8. Add health checks, image pinning, and backup scheduling.
9. Work through data integrity, content, SEO, and performance improvements.

## Release Exit Criteria

- [x] All P0 repository/runtime mitigations are complete; owner password
  selection and the external off-host mount are tracked separately above.
- [x] Public smoke test reaches a final `200` without redirects looping.
- [x] Public admin and private media checks pass.
- [x] `npm run scan:secrets` and Trivy secret/misconfiguration scanning pass.
- [x] `npm run lint` passes with no errors.
- [x] `tsc --noEmit` passes.
- [x] Unit, integration, coverage, Redis, and three-project E2E suites pass.
- [x] `npm run build` succeeds from a clean checkout and lockfile.
- [x] Production dependency audit reports zero vulnerabilities.
- [x] The final container image scan reports zero fixed high/critical findings.
- [x] Migrations are current and a tagged rollback image is retained locally.
- [x] Backend readiness and storage checks pass, including write/stat/delete.
- [x] Checksummed MySQL, MinIO, and Umami backup/restore tests are recorded.
