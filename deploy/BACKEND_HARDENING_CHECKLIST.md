# Backend Hardening Checklist

Use this as the follow-up production checklist after the current auth, admin routing, and storage fixes.

Time estimates assume one developer doing a focused pass in this repo. They are rough planning estimates, not guarantees.

## Effort Summary

- Easy: about 3 to 5 developer-days total.
- Medium: about 5 to 11 developer-days total.
- Hard: about 5 to 11 developer-days total.
- Full backend checklist: about 13 to 27 developer-days total.

## Easy

### 1. Add Real Dependency Health Checks

Estimated time: about 0.5 to 1 day.

- [x] Update `/api/health` to verify MySQL connectivity with a short query.
- [x] Update `/api/health` to verify Redis connectivity with a short ping/read.
- [x] Update `/api/health` to verify MinIO connectivity with a short stat/list probe.
- [x] Keep health checks fast-fail with tight timeouts so probes do not hang.

### 2. Remove Runtime Table Creation From Routes

Estimated time: about 0.5 to 1 day.

- [x] Move `two_factor_codes` creation out of request handlers and into a migration.
- [x] Move `onair` table creation out of request handlers and into a migration.
- [x] Remove remaining `CREATE TABLE IF NOT EXISTS` calls from API routes.

### 3. Standardize Admin Authorization

Estimated time: about 0.5 to 1 day.

- [x] Review all admin APIs and confirm they consistently use the intended auth model.
- [x] Decide whether utility routes should keep API key/basic auth or move to `requireAdmin()`.
- [x] Document the intended admin auth pattern for future routes.

### 4. Improve Observability

Estimated time: about 0.5 to 1 day.

- [x] Replace scattered console logging with more structured route-level logs.
- [x] Include route, actor, resource id, and failure reason where useful.
- [x] Reduce noisy debug logs in production while keeping enough operational detail.

### 5. Add A Production Readiness Script

Estimated time: about 1 day.

- [x] Create a pre-deploy/backend readiness script.
- [x] Check env presence, DB, Redis, and MinIO live connectivity.
- [x] Include a safe storage write/delete verification step when appropriate.
- [x] Use the script before production deploys and major content operations.

## Medium

### 6. Add Request Schema Validation

Estimated time: about 1 to 2 days.

- [x] Add consistent request validation for write-heavy admin routes.
- [x] Standardize validation for body/query params, type coercion, and error responses.
- [x] Prefer one shared validation approach across routes.

### 7. Add Orphan Cleanup Tooling

Estimated time: about 1 to 2 days.

- [x] Add a script to find DB rows pointing to missing MinIO objects.
- [x] Add a script to find MinIO objects no longer referenced by DB rows.
- [x] Decide whether orphan cleanup should be manual, scheduled, or both.

### 8. Backup And Restore Discipline

Estimated time: about 1 to 2 days.

- [x] Confirm MySQL backups are running and restorable.
- [x] Confirm MinIO bucket backups or replication are in place.
- [x] Run at least one restore drill and document the procedure.

### 9. Add Abuse Monitoring

Estimated time: about 1 to 2 days.

- [x] Monitor failed login spikes.
- [x] Monitor contact form abuse spikes.
- [x] Monitor password reset spikes.
- [x] Monitor admin unlock usage and suspicious admin actions.

### 10. Unify Attachment Storage Strategy

Estimated time: about 1 to 3 days.

- [x] Decide whether contact attachments should move from local disk to MinIO.
- [x] If yes, migrate contact attachment storage and download paths.
- [x] Update backup expectations so attachment storage matches the rest of content media.

## Hard

### 11. Add Integration Tests For Destructive Flows

Estimated time: about 2 to 4 days.

- [x] Add integration tests for project delete plus object cleanup.
- [x] Add integration tests for credential delete plus object cleanup.
- [x] Add integration tests for page delete plus object cleanup.
- [x] Add integration tests for hero image delete plus object cleanup.
- [x] Add integration tests for upload/delete consistency.

### 12. Add Safer Content Deletion Strategy

Estimated time: about 2 to 5 days.

- [x] Decide whether hard delete is acceptable for all content types.
- [x] Consider trash/archive/versioning for content and uploaded media.
- [x] Protect against accidental deletion before large-scale content entry begins.

### 13. Standardize Image Conversion To WebP

Estimated time: about 1 to 2 days for the fastest safe version, or about 2 to 4 days for a fully consistent implementation across all image paths.

#### Current State

- [x] Document that uploads currently use two architectures:
- [x] Server-handled uploads through `/api/uploads/direct` and `/api/uploads/direct-json`.
- [x] Browser-to-MinIO presigned uploads through `/api/uploads`.
- [x] Document that hero images already have partial WebP variant generation in `app/api/admin/hero/image/route.ts`.

#### Key Constraint

- [x] Document the main architectural constraint clearly:
- [x] When the browser uploads directly to MinIO via presigned PUT, the app server does not see the file bytes during upload.
- [x] Because of that, the server cannot inline-convert those images to WebP at upload time unless there is a follow-up processing step.

#### Recommended Approaches

- [x] Option 1: Keep original uploads and automatically generate `.webp` variants after upload.
- [x] Option 1 notes:
- [x] This is the best fit for the current codebase.
- [x] It avoids rewriting every upload screen.
- [x] It likely requires moving the existing hero conversion logic into a shared helper.
- [x] It likely requires a post-upload/finalize step for presigned uploads.

- [ ] Option 2: Route all image uploads through the app server and convert before storage. Not adopted.
- [ ] Option 2 notes:
- [ ] Simpler conversion logic.
- [ ] More invasive because existing presigned upload flows would need to change.
- [ ] Increases app-server workload for image uploads.

- [ ] Option 3: Keep presigned uploads and add background image processing for variants. Not adopted.
- [ ] Option 3 notes:
- [ ] Most scalable long term.
- [ ] Highest complexity.
- [ ] Best if image volume grows significantly.

#### Practical Recommendation For This Repo

- [x] Short term: generate WebP variants everywhere server-side uploads already exist.
- [x] Next step: add a server endpoint or finalize step that reads freshly uploaded MinIO objects and generates WebP variants after presigned uploads complete.
- [x] Long term: standardize how variant metadata is stored and how pages choose WebP vs original images.

#### Implementation Tasks

- [x] Extract reusable image conversion logic from the hero image flow.
- [x] Add shared helper(s) for generating WebP variants with `sharp`.
- [x] Add consistent variant metadata storage for uploaded images.
- [x] Update image rendering code to prefer WebP when a variant exists.
- [x] Ensure delete flows remove both original and generated variant objects.
- [x] Add integration coverage for upload -> convert -> render -> delete behavior.

#### Why This Is Not Trivial

- [x] The hard part is not `sharp` itself.
- [x] The hard part is the mixed upload architecture.
- [x] A lot of admin pages currently use presigned uploads, so server-side conversion cannot happen inline without additional processing.

#### Storage Direction

- [x] Store all non-logo images in object storage (S3/MinIO).
- [x] Allow static logo/brand assets to remain in app files when they are part of the deployed UI bundle.
- [x] Migrate legacy bundled site images with `npm run media:migrate-site -- --apply` after moving source files under `data/static-media-source/`.
- [x] Treat shared fallback site-media keys as first-class references during orphan audits so cleanup does not delete managed static assets.

## Suggested Execution Order

- [x] 1. Add real dependency health checks. Estimated time: 0.5 to 1 day.
- [x] 2. Remove runtime table creation from routes. Estimated time: 0.5 to 1 day.
- [x] 3. Standardize admin authorization. Estimated time: 0.5 to 1 day.
- [x] 4. Improve observability. Estimated time: 0.5 to 1 day.
- [x] 5. Add a production readiness script. Estimated time: 1 day.
- [x] 6. Add request schema validation. Estimated time: 1 to 2 days.
- [x] 7. Add orphan cleanup tooling. Estimated time: 1 to 2 days.
- [x] 8. Backup and restore discipline. Estimated time: 1 to 2 days.
- [x] 9. Add abuse monitoring. Estimated time: 1 to 2 days.
- [x] 10. Unify attachment storage strategy. Estimated time: 1 to 3 days.
- [x] 11. Add integration tests for destructive flows. Estimated time: 2 to 4 days.
- [x] 12. Add safer content deletion strategy. Estimated time: 2 to 5 days.
- [x] 13. Standardize image conversion to WebP. Estimated time: 1 to 2 days for the fastest safe version, or 2 to 4 days for a fully consistent pass.