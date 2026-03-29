# Backup And Restore Runbook

This runbook covers the repo-supported backup workflow for MySQL and MinIO.

Contact-form attachments now live in MinIO under the `messages/` prefix. Once legacy message rows are migrated with `npm run attachments:migrate -- --apply`, those attachments are covered by the same bucket mirror and restore drill as other site media.

## Commands

- `npm run backup:snapshot`
  Creates a fresh MySQL backup artifact and mirrors the MinIO bucket into `data/backups/drill_<timestamp>/` without running restore verification.

- `npm run backup:drill`
  Creates the same backup artifacts, restores the MySQL backup into a temporary database, compares per-table row counts, mirrors the MinIO bucket locally, and performs a sampled object restore check back into MinIO under `restore-drills/<timestamp>/` before deleting the probe object.

## What The Drill Verifies

- MySQL backup creation succeeds from the configured environment.
- The backup artifact can be restored into a temporary database.
- Restored table counts match the live database table counts.
- MinIO bucket contents can be mirrored to local disk.
- At least one mirrored object can be restored back into MinIO and read successfully.

## Output

Each run writes a report file to the backup directory:

- `data/backups/drill_<timestamp>/report.json`

That report records the backup path, mirror path, restore verification results, and any mismatches.

## Operational Recommendation

- Run `npm run backup:snapshot` on a schedule for routine backups.
- Run `npm run backup:drill` manually during maintenance windows and before high-risk deploys or schema work.
- Keep at least one recent successful `report.json` from a full drill as evidence that the restore path still works.

## Cleanup Notes

- The MySQL restore drill drops the temporary restore database automatically unless `--keep-restore-db` is passed.
- The MinIO restore drill removes its sampled `restore-drills/...` object after verification.

## Examples

```powershell
npm run backup:snapshot
npm run backup:drill
npm run backup:drill -- --keep-restore-db
npm run attachments:migrate -- --apply
```