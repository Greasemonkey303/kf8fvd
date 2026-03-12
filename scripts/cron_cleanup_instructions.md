Cron / Scheduled cleanup for `admin_actions`

Purpose
- Regularly remove old `admin_actions` rows to limit table size and meet retention policy.

Quick instructions (Linux)
- Install Node and ensure the project can access DB credentials (use `.env.local` or environment variables).
- Add a cron job (runs daily at 03:00):

```
0 3 * * * /usr/bin/node /path/to/repo/scripts/cleanup_admin_actions.js 365 >> /var/log/kf8fvd_cleanup.log 2>&1
```

- Adjust the `365` argument (days) or set `ADMIN_ACTIONS_RETENTION_DAYS` env var.

Windows (Task Scheduler)
- Create a scheduled task that runs `node C:\path\to\repo\scripts\cleanup_admin_actions.js 365` daily.

Kubernetes / Containers
- Run `node scripts/cleanup_admin_actions.js 365` as a one-off CronJob using your cluster's CronJob resource.

Notes
- The script reads `.env.local` if present; prefer injecting DB credentials from environment or a secrets store in production.
- Log rotation: ensure the logfile is rotated to avoid disk growth.
