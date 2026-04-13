Deploy Folder Guide
===================

This folder is organized by active rollout docs, dated change notes, and supporting material.

Primary folders

- `current/`
  - active rollout docs that used to live loose at the top level
- `changes/`
  - dated notes for one-off environment changes, rollback notes, and cleanup history

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

1. Start with `current/PRODUCTION_CHECKLIST.md`.
2. Read `current/DEPLOY_UPDATE_2026-03-29_UMAMI_MONITORING.md` for the latest analytics and monitoring changes.
3. Use `handoff/PRODUCTION_HANDOFF_2026-03-24.txt` for historical production context.
4. Use `changes/2026-04-12/DEV_LOCAL_SETUP_NOTES.md` for the current localhost dev rollback guidance.
5. Open subfolder documents only as needed for the specific rollout task.

Important current rollout note

- The updated admin monitoring rollout still requires the main site MySQL migration `migrations/2026_03_29_maintenance_runs.sql`.
- The self-hosted analytics stack also requires the additional `umami` and `umami-db` services.