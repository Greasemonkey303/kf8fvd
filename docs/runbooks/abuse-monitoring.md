# Abuse Monitoring Runbook

This runbook covers the backend abuse signals added for login failures, contact-form abuse, password reset spikes, and risky admin actions.

Quick references
- CLI summary: `npm run monitor:abuse`
- JSON summary for schedulers/SIEM: `npm run monitor:abuse -- --json`
- Prometheus exporter: `npm run exporter:start` then query `http://localhost:9403/metrics`
- Admin audit feed: `GET /api/admin/admin-actions`
- Admin unlock feed: `GET /api/admin/auth-locks`

Primary metrics
- `failed_login_attempts_10m`: failed logins in the last 10 minutes.
- `failed_login_unique_ips_10m`: unique IPs behind those failed logins.
- `contact_messages_10m`: accepted contact submissions in the last 10 minutes.
- `contact_abuse_events_10m`: rejected contact attempts in the last 10 minutes for honeypot, Turnstile, or attachment abuse reasons.
- `password_reset_requests_10m`: password reset rows created in the last 10 minutes.
- `password_reset_requests_total`: all forgot-password requests seen by the app, including unknown-email requests.
- `password_reset_unknown_email_total`: forgot-password requests for unknown accounts.
- `admin_unlocks_24h`: admin unlock actions in the last 24 hours.
- `suspicious_admin_actions_24h`: admin `unlock` and `export` actions in the last 24 hours.

Suggested thresholds
- Failed login spike: warn at `25` in 10 minutes, critical at `50`.
- Contact abuse spike: warn at `5` in 10 minutes, critical at `10`.
- Password reset spike: warn at `10` in 10 minutes, critical at `20`.
- Admin unlock spike: warn at `3` in 24 hours, critical at `6`.
- Suspicious admin actions: warn at `5` in 24 hours, critical at `10`.

You can override the CLI thresholds with env vars:
- `ABUSE_FAILED_LOGINS_WARN`, `ABUSE_FAILED_LOGINS_CRITICAL`
- `ABUSE_CONTACT_WARN`, `ABUSE_CONTACT_CRITICAL`
- `ABUSE_PASSWORD_RESETS_WARN`, `ABUSE_PASSWORD_RESETS_CRITICAL`
- `ABUSE_ADMIN_UNLOCKS_WARN`, `ABUSE_ADMIN_UNLOCKS_CRITICAL`
- `ABUSE_ADMIN_ACTIONS_WARN`, `ABUSE_ADMIN_ACTIONS_CRITICAL`

Response workflow
1. Run `npm run monitor:abuse -- --json` and capture the current snapshot.
2. If `failed_login_attempts_10m` is elevated, inspect top IPs and top emails from the report, then review `auth_locks_total` and active lock keys through `/api/admin/auth-locks`.
3. If `contact_abuse_events_10m` is elevated, review the `byReason` breakdown. Honeypot and Turnstile spikes usually point to bot traffic; attachment errors usually point to upload abuse.
4. If `password_reset_requests_10m` or `password_reset_unknown_email_total` rises quickly, review top target emails and consider temporary edge throttling for `/api/forgot-password`.
5. If `admin_unlocks_24h` or `suspicious_admin_actions_24h` is elevated, review `/api/admin/admin-actions` and confirm the actor, IP, and reason for each unlock/export.

SQL checks
- Top failed-login IPs:
  `SELECT ip, COUNT(*) FROM login_attempts WHERE success = 0 AND created_at > NOW() - INTERVAL 10 MINUTE GROUP BY ip ORDER BY 2 DESC LIMIT 20;`
- Contact abuse by reason:
  `SELECT reason, COUNT(*) FROM login_attempts WHERE success = 0 AND reason IN ('honeypot','turnstile_missing','turnstile_failed','file_too_large','total_size_exceeded','unsupported_file_type') AND created_at > NOW() - INTERVAL 10 MINUTE GROUP BY reason ORDER BY 2 DESC;`
- Password reset targets:
  `SELECT email, COUNT(*) FROM password_resets WHERE created_at > NOW() - INTERVAL 10 MINUTE GROUP BY email ORDER BY 2 DESC LIMIT 20;`
- Recent unlock/export actions:
  `SELECT actor, action, ip, reason, created_at FROM admin_actions WHERE action IN ('unlock','export') AND created_at > NOW() - INTERVAL 24 HOUR ORDER BY created_at DESC LIMIT 50;`

Operational notes
- `password_reset_requests_total` is emitted at request time, even when the email does not exist, so it is the best signal for enumeration attempts.
- `contact_messages_10m` and `contact_abuse_events_10m` should be read together. A spike in accepted messages with no abuse events is still worth checking if it is outside the normal site baseline.
- Unlocks are not always malicious, but repeated unlocks usually mean the rate-limiter threshold is too low for a real user or an operator is responding to ongoing abuse.