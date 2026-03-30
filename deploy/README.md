Deploy Folder Guide
===================

This folder is organized by current rollout docs at the top level and supporting material in subfolders.

Top-level files

- `PRODUCTION_CHECKLIST.md`
  - current concise production rollout checklist
- `DEPLOY_UPDATE_2026-03-29_UMAMI_MONITORING.md`
  - latest dated deployment update for Umami analytics, monitoring, privacy, and the `maintenance_runs` MySQL migration

Subfolders

- `checklists/`
  - longer backend and frontend hardening checklists
- `handoff/`
  - dated handoff notes and one-time bootstrap records
- `reference/`
  - supporting reference docs such as secrets, performance notes, and deployment prompts
- `services/`
  - service unit files and related runtime assets
- `sql/`
  - SQL import files used for deployment/bootstrap work

Suggested reading order

1. Start with `PRODUCTION_CHECKLIST.md`.
2. Read `DEPLOY_UPDATE_2026-03-29_UMAMI_MONITORING.md` for the latest analytics and monitoring changes.
3. Use `handoff/PRODUCTION_HANDOFF_2026-03-24.txt` for historical production context.
4. Open subfolder documents only as needed for the specific rollout task.

Important current rollout note

- The updated admin monitoring rollout still requires the main site MySQL migration `migrations/2026_03_29_maintenance_runs.sql`.
- The self-hosted analytics stack also requires the additional `umami` and `umami-db` services.