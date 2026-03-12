#!/usr/bin/env node
// Minimal Prometheus exporter for auth metrics (auth_locks, login_attempts, redis rl:* keys)
const http = require('http')
const mysql = require('mysql2/promise')
let Redis
try { Redis = require('ioredis') } catch (e) { Redis = null }

const port = Number(process.env.METRICS_PORT || process.env.EXPORTER_PORT || 9403)

// Metrics namespace (match rateLimiter). Use METRICS_PREFIX or NODE_ENV.
const METRICS_PREFIX = process.env.METRICS_PREFIX || process.env.NODE_ENV || 'local'
function metricKey(name) { return `metrics:${METRICS_PREFIX}:${name}` }

async function collect() {
  const metrics = { auth_locks: 0, login_attempts: 0, redis_rl_keys: 0 }
  // DB
  try {
    const conn = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT ? Number(process.env.DB_PORT):3306, user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME || 'kf8fvd' })
    const [[locksRow]] = await conn.execute('SELECT COUNT(*) as cnt FROM auth_locks')
    const [[attemptsRow]] = await conn.execute('SELECT COUNT(*) as cnt FROM login_attempts')
    metrics.auth_locks = (locksRow && locksRow.cnt) ? locksRow.cnt : 0
    metrics.login_attempts = (attemptsRow && attemptsRow.cnt) ? attemptsRow.cnt : 0
    await conn.end()
  } catch (e) {
    console.warn('DB query failed', e && e.message ? e.message : e)
  }

  // Redis
  if (Redis && process.env.REDIS_URL) {
    try {
      const r = new Redis(process.env.REDIS_URL)
      // Prefer cumulative counters stored in Redis if present (written by rateLimiter)
      try {
        const loginAttempts = await r.get(metricKey('login_attempts_total'))
        const authLocksTotal = await r.get(metricKey('auth_locks_total'))
        const authLocksActive = await r.get(metricKey('auth_locks_active'))
        if (loginAttempts) metrics.login_attempts = Number(loginAttempts)
        if (authLocksTotal) metrics.auth_locks = Number(authLocksTotal)
        else if (authLocksActive) metrics.auth_locks = Number(authLocksActive)
      } catch (e) {
        // best-effort, continue to scan rl:* keys below
      }

      let cursor = '0'
      let count = 0
      do {
        const res = await r.scan(cursor, 'MATCH', 'rl:*', 'COUNT', 200)
        cursor = res[0]
        count += (res[1] && res[1].length) ? res[1].length : 0
      } while (cursor !== '0')
      metrics.redis_rl_keys = count
      r.disconnect()
    } catch (e) {
      console.warn('Redis scan failed', e && e.message ? e.message : e)
    }
  }

  return metrics
}

function toProm(metrics) {
  const lines = []
  lines.push('# HELP auth_locks_total Total number of auth_locks')
  lines.push('# TYPE auth_locks_total gauge')
  lines.push(`auth_locks_total ${metrics.auth_locks}`)
  lines.push('# HELP login_attempts_total Total number of login attempts')
  lines.push('# TYPE login_attempts_total gauge')
  lines.push(`login_attempts_total ${metrics.login_attempts}`)
  lines.push('# HELP redis_rl_keys_total Number of rl:* keys in Redis')
  lines.push('# TYPE redis_rl_keys_total gauge')
  lines.push(`redis_rl_keys_total ${metrics.redis_rl_keys}`)
  lines.push('# HELP exporter_up Exporter health')
  lines.push('# TYPE exporter_up gauge')
  lines.push('exporter_up 1')
  return lines.join('\n') + '\n'
}

const server = http.createServer(async (req, res) => {
  if (req.url !== '/metrics') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('OK')
    return
  }
  try {
    const m = await collect()
    const body = toProm(m)
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(body)
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end('error')
  }
})

server.listen(port, () => console.log('Exporter listening on port', port))
