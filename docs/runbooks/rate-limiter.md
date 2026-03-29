# Rate-limiter Runbook (kf8fvd)

This runbook covers common alerts and remediation steps for the authentication rate-limiter, Redis failover, and the metrics exporter.

Quick references
- Admin locks API: `GET /api/admin/auth-locks` (list) and `POST /api/admin/auth-locks` (body: `{ "key": "email:foo@bar.com" }`). Use a signed-in admin session, or supply `x-admin-key: <ADMIN_API_KEY>` / Basic auth for scripted access.
- Admin UI: `/admin/locks` (works with the signed-in admin session; utility credentials are optional overrides)
- DB emergency unlock: `DELETE FROM auth_locks WHERE key_name = ?` or `TRUNCATE TABLE auth_locks` (careful: global)
- Redis manual unlock (preferred when Redis is healthy):
  - Use `SCAN` to avoid blocking: `redis-cli -u redis://127.0.0.1:6379 --scan --pattern 'rl:lock:*' | xargs -r -n 50 redis-cli -u redis://127.0.0.1:6379 DEL`

Alerts & runbook steps

1) AuthLocksSpike / HighAuthLockRate (severity: critical)
- What it means: Many accounts/IPs hit lock thresholds in short time window (possible credential stuffing/brute force).
- Immediate checks:
  - Query `/api/admin/auth-locks` to list active locks and sample keys.
  - Check `login_attempts_total` and `auth_locks_total` in Grafana/Prometheus for which timeframe and spike magnitude.
  - Inspect `login_attempts` DB table for recent failures and originating IPs: `SELECT ip, COUNT(*) FROM login_attempts WHERE created_at > NOW() - INTERVAL 10 MINUTE GROUP BY ip ORDER BY 2 DESC LIMIT 50`.
- Mitigation steps:
  - If isolated legitimate users affected, unlock specific keys via admin API: `curl -X POST -H 'x-admin-key: <ADMIN_API_KEY>' -H 'Content-Type: application/json' --data '{"key":"email:joe@example.com"}' http://localhost:3000/api/admin/auth-locks`
  - If you are already signed in through the admin UI, use `/admin/locks` directly without supplying utility credentials.
  - If widespread abusive traffic: temporarily increase `RATE_LOCK_MS` or `RATE_MAX` (short-term) and block offending IPs at edge/firewall.
  - Consider enabling additional anti-automation protections (Cloudflare Turnstile) globally for login routes.

2) HighLoginAttemptRate (severity: warning)
- What it means: Elevated login attempts; may be precursor to lock spikes.
- Steps:
  - Query login_attempts trend and top IPs/emails.
  - If automated, throttle at edge or add stricter Turnstile checks.

3) HighRedisRlKeys (severity: warning)
- What it means: Large number of `rl:*` keys in Redis; can indicate many unique lock keys or improper TTL behavior.
- Steps:
  - Inspect Redis key TTLs: use `redis-cli --scan --pattern 'rl:count:*'` and `PTTL` on sample keys.
  - If many stale keys: consider flushing expired keys or increasing TTL expiry in `METRICS_TTL_SEC` / rate-limiter configuration.

4) ExporterDown (severity: critical)
- What it means: `monitor/exporter.js` is not reachable or failing to collect metrics.
- Steps:
  - Check exporter process logs (if run manually): `ps aux | grep exporter` or check systemd/pm2 logs.
  - Restart exporter: `node monitor/exporter.js &` (prefer a process manager in production)
  - Verify `/metrics` endpoint responds: `curl -sS http://localhost:9403/metrics`

Emergency DB/Redis commands
- Unlock single key (DB):
  - `DELETE FROM auth_locks WHERE key_name = 'email:joe@example.com'`
- Unlock single key (Redis):
  - `redis-cli -u redis://127.0.0.1:6379 DEL 'rl:lock:email%3Ajoe%40example.com' 'rl:count:email%3Ajoe%40example.com'`
- Bulk remove (use with extreme caution):
  - Use `SCAN` to find keys and remove in batches.

How to run failover and bench tests locally
- Failover simulation (tests exist): `npx vitest run tests/integration/rateLimiter.failover.spec.ts`
- Admin unlock integration test: `npx vitest run tests/integration/adminLocks.spec.ts`
- Lightweight Redis bench (measure Lua eval throughput):
  - `BENCH_CONCURRENCY=10 BENCH_REQUESTS=100 node scripts/bench_rate_limiter.js`

Recommended thresholds (starting points)
- `AuthLocksSpike` alert: >5 locks in 5m (tune by traffic)
- `HighLoginAttemptRate`: >200 attempts in 5m (tune for your baseline)
- `HighRedisRlKeys`: >1000 active rl keys (tune by instance size)

Notes
- Always prefer targeted unlocks over clearing all locks.
- Record actions taken (who unlocked, why) in audit logs and review `admin_actions` when unlock volume increases.
