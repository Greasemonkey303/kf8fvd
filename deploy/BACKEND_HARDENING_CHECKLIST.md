# Backend Hardening Checklist

Use this as the follow-up production checklist after the current auth, admin routing, and storage fixes.

## 1. Add Real Dependency Health Checks

- [ ] Update `/api/health` to verify MySQL connectivity with a short query.
- [ ] Update `/api/health` to verify Redis connectivity with a short ping/read.
- [ ] Update `/api/health` to verify MinIO connectivity with a short stat/list probe.
- [ ] Keep health checks fast-fail with tight timeouts so probes do not hang.

## 2. Remove Runtime Table Creation From Routes

- [ ] Move `two_factor_codes` creation out of request handlers and into a migration.
- [ ] Move `onair` table creation out of request handlers and into a migration.
- [ ] Remove remaining `CREATE TABLE IF NOT EXISTS` calls from API routes.

## 3. Standardize Admin Authorization

- [ ] Review all admin APIs and confirm they consistently use the intended auth model.
- [ ] Decide whether utility routes should keep API key/basic auth or move to `requireAdmin()`.
- [ ] Document the intended admin auth pattern for future routes.

## 4. Add Request Schema Validation

- [ ] Add consistent request validation for write-heavy admin routes.
- [ ] Standardize validation for body/query params, type coercion, and error responses.
- [ ] Prefer one shared validation approach across routes.

## 5. Add Integration Tests For Destructive Flows

- [ ] Add integration tests for project delete plus object cleanup.
- [ ] Add integration tests for credential delete plus object cleanup.
- [ ] Add integration tests for page delete plus object cleanup.
- [ ] Add integration tests for hero image delete plus object cleanup.
- [ ] Add integration tests for upload/delete consistency.

## 6. Add Orphan Cleanup Tooling

- [ ] Add a script to find DB rows pointing to missing MinIO objects.
- [ ] Add a script to find MinIO objects no longer referenced by DB rows.
- [ ] Decide whether orphan cleanup should be manual, scheduled, or both.

## 7. Unify Attachment Storage Strategy

- [ ] Decide whether contact attachments should move from local disk to MinIO.
- [ ] If yes, migrate contact attachment storage and download paths.
- [ ] Update backup expectations so attachment storage matches the rest of content media.

## 8. Improve Observability

- [ ] Replace scattered console logging with more structured route-level logs.
- [ ] Include route, actor, resource id, and failure reason where useful.
- [ ] Reduce noisy debug logs in production while keeping enough operational detail.

## 9. Backup And Restore Discipline

- [ ] Confirm MySQL backups are running and restorable.
- [ ] Confirm MinIO bucket backups or replication are in place.
- [ ] Run at least one restore drill and document the procedure.

## 10. Add Safer Content Deletion Strategy

- [ ] Decide whether hard delete is acceptable for all content types.
- [ ] Consider trash/archive/versioning for content and uploaded media.
- [ ] Protect against accidental deletion before large-scale content entry begins.

## 11. Add Abuse Monitoring

- [ ] Monitor failed login spikes.
- [ ] Monitor contact form abuse spikes.
- [ ] Monitor password reset spikes.
- [ ] Monitor admin unlock usage and suspicious admin actions.

## 12. Add A Production Readiness Script

- [ ] Create a pre-deploy/backend readiness script.
- [ ] Check env presence, DB, Redis, and MinIO live connectivity.
- [ ] Include a safe storage write/delete verification step when appropriate.
- [ ] Use the script before production deploys and major content operations.

## 13. Standardize Image Conversion To WebP

### Current State

- [ ] Document that uploads currently use two architectures:
- [ ] Server-handled uploads through `/api/uploads/direct` and `/api/uploads/direct-json`.
- [ ] Browser-to-MinIO presigned uploads through `/api/uploads`.
- [ ] Document that hero images already have partial WebP variant generation in `app/api/admin/hero/image/route.ts`.

### Key Constraint

- [ ] Document the main architectural constraint clearly:
- [ ] When the browser uploads directly to MinIO via presigned PUT, the app server does not see the file bytes during upload.
- [ ] Because of that, the server cannot inline-convert those images to WebP at upload time unless there is a follow-up processing step.

### Recommended Approaches

- [ ] Option 1: Keep original uploads and automatically generate `.webp` variants after upload.
- [ ] Option 1 notes:
- [ ] This is the best fit for the current codebase.
- [ ] It avoids rewriting every upload screen.
- [ ] It likely requires moving the existing hero conversion logic into a shared helper.
- [ ] It likely requires a post-upload/finalize step for presigned uploads.

- [ ] Option 2: Route all image uploads through the app server and convert before storage.
- [ ] Option 2 notes:
- [ ] Simpler conversion logic.
- [ ] More invasive because existing presigned upload flows would need to change.
- [ ] Increases app-server workload for image uploads.

- [ ] Option 3: Keep presigned uploads and add background image processing for variants.
- [ ] Option 3 notes:
- [ ] Most scalable long term.
- [ ] Highest complexity.
- [ ] Best if image volume grows significantly.

### Practical Recommendation For This Repo

- [ ] Short term: generate WebP variants everywhere server-side uploads already exist.
- [ ] Next step: add a server endpoint or finalize step that reads freshly uploaded MinIO objects and generates WebP variants after presigned uploads complete.
- [ ] Long term: standardize how variant metadata is stored and how pages choose WebP vs original images.

### Implementation Tasks

- [ ] Extract reusable image conversion logic from the hero image flow.
- [ ] Add shared helper(s) for generating WebP variants with `sharp`.
- [ ] Add consistent variant metadata storage for uploaded images.
- [ ] Update image rendering code to prefer WebP when a variant exists.
- [ ] Ensure delete flows remove both original and generated variant objects.
- [ ] Add integration coverage for upload -> convert -> render -> delete behavior.

### Difficulty / Effort

- [ ] Fastest safe version: about half a day to one day.
- [ ] Medium complexity overall, not a trivial one-file change.
- [ ] Fully consistent implementation across every image path in the repo: about one day, possibly a bit more depending on cleanup and test depth.

### Why This Is Not Trivial

- [ ] The hard part is not `sharp` itself.
- [ ] The hard part is the mixed upload architecture.
- [ ] A lot of admin pages currently use presigned uploads, so server-side conversion cannot happen inline without additional processing.

## Suggested Priority Order

- [ ] 1. Add real dependency health checks.
- [ ] 2. Move runtime table creation into migrations.
- [ ] 3. Add destructive-flow integration tests.
- [ ] 4. Unify contact attachments with MinIO.
- [ ] 5. Confirm backups and restore process.