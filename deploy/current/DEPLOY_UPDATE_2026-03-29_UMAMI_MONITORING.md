Deployment Update: Umami Analytics, Monitoring, and Privacy
===========================================================

Date: 2026-03-29

Scope of this update

- Added self-hosted Umami analytics for public site traffic.
- Added a dedicated PostgreSQL service for Umami.
- Kept the main site on port 3000 in Docker.
- Added a same-origin analytics relay through the app so page-path tracking works reliably.
- Extended admin monitoring to include Umami and Umami PostgreSQL.
- Updated the privacy policy to document self-hosted analytics and operational monitoring.
- Adjusted project detail media layout so gallery images render more consistently.

New or changed runtime services

- App container:
  - service name: kf8fvd
  - local port: 127.0.0.1:3000 -> 3000
- Umami container:
  - service name: umami
  - container name: kf8fvd-umami
  - local port: 127.0.0.1:3001 -> 3000
- Umami PostgreSQL container:
  - service name: umami-db
  - container name: kf8fvd-umami-db
  - internal port: 5432

Important implementation details

- Umami v3 requires PostgreSQL. It no longer supports MySQL.
- Umami uses its own PostgreSQL service and does not add new analytics tables to the main site MySQL database.
- The site does not send analytics directly from the browser to Umami anymore for page tracking.
- Public pageviews are posted to the app route `/api/analytics/umami`, then forwarded server-side to Umami `/api/send`.
- This same-origin relay fixes local multi-port tracking issues and preserves route path reporting.
- Admin, auth, and API routes are excluded from analytics tracking.

Database migrations and schema changes

- Main site MySQL migration used by the monitoring work:
  - `migrations/2026_03_29_maintenance_runs.sql`
- This migration creates the `maintenance_runs` table in the main MySQL database.
- Purpose of `maintenance_runs`:
  - stores task name, status, command text, summary, error text, runtime, start time, and finish time
  - feeds the admin live monitoring page maintenance history and task-status section
- Indexed columns added by this migration:
  - `(task_name, finished_at)`
  - `(status, finished_at)`
- Deployment note:
  - apply this migration to the main site MySQL database anywhere the updated admin monitoring page is being deployed
  - this is separate from the Umami PostgreSQL container and should not be skipped just because Umami has its own database

Files changed in this batch

- docker-compose.yml
- .env
- app/layout.tsx
- app/api/analytics/umami/route.ts
- components/analytics/UmamiAnalytics.tsx
- components/analytics/UmamiPageTracker.tsx
- public/umami-before-send.js
- app/admin/monitoring/route.ts
- app/admin/utilities/monitoring/page.tsx
- app/privacy/page.tsx
- app/projects/[slug]/page.tsx
- components/projects/ProjectMedia.tsx
- app/projects/hotspot/hotspot.module.css

Environment and compose additions

- Umami app settings:
  - UMAMI_SERVER_URL
  - UMAMI_APP_SECRET
  - UMAMI_TRACKER_SCRIPT_NAME
  - UMAMI_CLIENT_IP_HEADER
- Umami PostgreSQL settings:
  - UMAMI_POSTGRES_DB
  - UMAMI_POSTGRES_USER
  - UMAMI_POSTGRES_PASSWORD
  - UMAMI_POSTGRES_HOST
  - UMAMI_POSTGRES_PORT
- Docker-only internal overrides:
  - DOCKER_UMAMI_SERVER_URL
  - DOCKER_UMAMI_POSTGRES_HOST
  - DOCKER_UMAMI_POSTGRES_PORT
- Public client analytics settings:
  - NEXT_PUBLIC_UMAMI_HOST_URL
  - NEXT_PUBLIC_UMAMI_SCRIPT_URL
  - NEXT_PUBLIC_UMAMI_WEBSITE_ID
  - NEXT_PUBLIC_UMAMI_DOMAINS
  - NEXT_PUBLIC_UMAMI_ALLOW_LOCALHOST

Admin monitoring additions

- Added dependency probes for:
  - Umami dashboard service
  - Umami PostgreSQL TCP reachability
- Added endpoint checks for:
  - Umami dashboard
  - Umami tracker script
- Added a dedicated analytics card in admin monitoring showing:
  - service target
  - status
  - latency
  - configured website ID state

Privacy policy changes

- The privacy page now states that:
  - the site uses self-hosted Umami analytics for public pages
  - analytics are stored in a self-hosted Umami service backed by PostgreSQL controlled by the site owner
  - admin, API, and account-management routes are excluded
  - analytics include page paths, referrers, approximate location, screen size, and device/browser details
  - operational monitoring and abuse-prevention metrics are also collected for reliability and security

Local verification completed

- `npm run build` passed after the monitoring and privacy updates.
- `docker compose up -d --build` completed successfully.
- `docker compose ps` confirmed:
  - kf8fvd up
  - kf8fvd-umami up
  - kf8fvd-umami-db healthy
- `http://127.0.0.1:3000/privacy` returned HTTP 200 after rebuild.

Recommended production follow-up

1. Replace all current dev-only Umami and PostgreSQL secrets before any production rollout.
2. Set production Umami host values in the runtime environment instead of leaving localhost-based values.
3. Decide whether Umami should remain directly exposed on its own port or be reverse-proxied behind the main site domain.
4. Add backup coverage for the Umami PostgreSQL volume if analytics history matters operationally.
5. Add alerts for Umami service down, Umami tracker script failures, and Umami PostgreSQL health if analytics uptime is important.

Useful commands

- Rebuild local stack:
  - `docker compose up -d --build`
- Check containers:
  - `docker compose ps`
- View app logs:
  - `docker logs --tail 100 kf8fvd`
- View Umami logs:
  - `docker logs --tail 100 kf8fvd-umami`
- View Umami PostgreSQL logs:
  - `docker logs --tail 100 kf8fvd-umami-db`

Current status

- The local Docker stack now includes the app, Umami, and Umami PostgreSQL.
- Admin monitoring includes the new analytics services.
- The privacy page reflects the current site behavior.
- The analytics relay path and service checks are part of the deployed application build.