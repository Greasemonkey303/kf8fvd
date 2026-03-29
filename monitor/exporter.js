#!/usr/bin/env node
// Minimal Prometheus exporter for auth metrics (auth_locks, login_attempts, redis rl:* keys)
const http = require('http')
const fs = require('fs')
const mysql = require('mysql2/promise')
const path = require('path')
let Redis
try { Redis = require('ioredis') } catch { Redis = null }

try {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8')
    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      const idx = trimmed.indexOf('=')
      if (idx === -1) return
      const key = trimmed.slice(0, idx).trim()
      let value = trimmed.slice(idx + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
      if (!process.env[key]) process.env[key] = value
    })
  }
} catch {}

const port = Number(process.env.METRICS_PORT || process.env.EXPORTER_PORT || 9403)
const CONTACT_ABUSE_REASONS = [
  'honeypot',
  'turnstile_missing',
  'turnstile_failed',
  'file_too_large',
  'total_size_exceeded',
  'unsupported_file_type',
]

// Metrics namespace (match rateLimiter). Use METRICS_PREFIX or NODE_ENV.
const METRICS_PREFIX = process.env.METRICS_PREFIX || process.env.NODE_ENV || 'local'
function metricKey(name) { return `metrics:${METRICS_PREFIX}:${name}` }

async function collect() {
  const metrics = {
    auth_locks: 0,
    login_attempts: 0,
    redis_rl_keys: 0,
    failed_login_attempts_10m: 0,
    failed_login_unique_ips_10m: 0,
    contact_messages_10m: 0,
    contact_messages_unique_ips_10m: 0,
    contact_abuse_events_10m: 0,
    password_reset_requests_10m: 0,
    admin_unlocks_24h: 0,
    suspicious_admin_actions_24h: 0,
    contact_messages_total: 0,
    contact_abuse_total: 0,
    password_reset_requests_total: 0,
    password_reset_unknown_email_total: 0,
    admin_unlocks_total: 0,
  }
  // DB
  try {
    const conn = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT ? Number(process.env.DB_PORT):3306, user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME || 'kf8fvd' })
    const [[locksRow]] = await conn.execute('SELECT COUNT(*) as cnt FROM auth_locks')
    const [[attemptsRow]] = await conn.execute('SELECT COUNT(*) as cnt FROM login_attempts')
    const [[failedLogins10mRow]] = await conn.execute('SELECT COUNT(*) as cnt FROM login_attempts WHERE success = 0 AND created_at > NOW() - INTERVAL 10 MINUTE')
    const [[failedLoginIps10mRow]] = await conn.execute('SELECT COUNT(DISTINCT ip) as cnt FROM login_attempts WHERE success = 0 AND ip IS NOT NULL AND ip <> "" AND created_at > NOW() - INTERVAL 10 MINUTE')
    const [[contactMessages10mRow]] = await conn.execute('SELECT COUNT(*) as cnt FROM messages WHERE is_deleted = 0 AND created_at > NOW() - INTERVAL 10 MINUTE')
    const [[contactMessageIps10mRow]] = await conn.execute('SELECT COUNT(DISTINCT ip) as cnt FROM messages WHERE is_deleted = 0 AND ip IS NOT NULL AND ip <> "" AND created_at > NOW() - INTERVAL 10 MINUTE')
    const placeholders = CONTACT_ABUSE_REASONS.map(() => '?').join(', ')
    const [[contactAbuse10mRow]] = await conn.execute(`SELECT COUNT(*) as cnt FROM login_attempts WHERE success = 0 AND reason IN (${placeholders}) AND created_at > NOW() - INTERVAL 10 MINUTE`, CONTACT_ABUSE_REASONS)
    const [[passwordResets10mRow]] = await conn.execute('SELECT COUNT(*) as cnt FROM password_resets WHERE created_at > NOW() - INTERVAL 10 MINUTE')
    const [[adminUnlocks24hRow]] = await conn.execute('SELECT COUNT(*) as cnt FROM admin_actions WHERE action = ? AND created_at > NOW() - INTERVAL 24 HOUR', ['unlock'])
    const [[suspiciousAdminActions24hRow]] = await conn.execute('SELECT COUNT(*) as cnt FROM admin_actions WHERE action IN (?, ?) AND created_at > NOW() - INTERVAL 24 HOUR', ['unlock', 'export'])
    metrics.auth_locks = (locksRow && locksRow.cnt) ? locksRow.cnt : 0
    metrics.login_attempts = (attemptsRow && attemptsRow.cnt) ? attemptsRow.cnt : 0
    metrics.failed_login_attempts_10m = (failedLogins10mRow && failedLogins10mRow.cnt) ? failedLogins10mRow.cnt : 0
    metrics.failed_login_unique_ips_10m = (failedLoginIps10mRow && failedLoginIps10mRow.cnt) ? failedLoginIps10mRow.cnt : 0
    metrics.contact_messages_10m = (contactMessages10mRow && contactMessages10mRow.cnt) ? contactMessages10mRow.cnt : 0
    metrics.contact_messages_unique_ips_10m = (contactMessageIps10mRow && contactMessageIps10mRow.cnt) ? contactMessageIps10mRow.cnt : 0
    metrics.contact_abuse_events_10m = (contactAbuse10mRow && contactAbuse10mRow.cnt) ? contactAbuse10mRow.cnt : 0
    metrics.password_reset_requests_10m = (passwordResets10mRow && passwordResets10mRow.cnt) ? passwordResets10mRow.cnt : 0
    metrics.admin_unlocks_24h = (adminUnlocks24hRow && adminUnlocks24hRow.cnt) ? adminUnlocks24hRow.cnt : 0
    metrics.suspicious_admin_actions_24h = (suspiciousAdminActions24hRow && suspiciousAdminActions24hRow.cnt) ? suspiciousAdminActions24hRow.cnt : 0
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
        const contactMessagesTotal = await r.get(metricKey('contact_messages_total'))
        const contactAbuseTotal = await r.get(metricKey('contact_abuse_total'))
        const passwordResetRequestsTotal = await r.get(metricKey('password_reset_requests_total'))
        const passwordResetUnknownEmailTotal = await r.get(metricKey('password_reset_unknown_email_total'))
        const adminUnlocksTotal = await r.get(metricKey('admin_unlocks_total'))
        if (loginAttempts) metrics.login_attempts = Number(loginAttempts)
        if (authLocksTotal) metrics.auth_locks = Number(authLocksTotal)
        else if (authLocksActive) metrics.auth_locks = Number(authLocksActive)
        if (contactMessagesTotal) metrics.contact_messages_total = Number(contactMessagesTotal)
        if (contactAbuseTotal) metrics.contact_abuse_total = Number(contactAbuseTotal)
        if (passwordResetRequestsTotal) metrics.password_reset_requests_total = Number(passwordResetRequestsTotal)
        if (passwordResetUnknownEmailTotal) metrics.password_reset_unknown_email_total = Number(passwordResetUnknownEmailTotal)
        if (adminUnlocksTotal) metrics.admin_unlocks_total = Number(adminUnlocksTotal)
      } catch {
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
  lines.push('# HELP failed_login_attempts_10m Failed login attempts over the last 10 minutes')
  lines.push('# TYPE failed_login_attempts_10m gauge')
  lines.push(`failed_login_attempts_10m ${metrics.failed_login_attempts_10m}`)
  lines.push('# HELP failed_login_unique_ips_10m Unique IPs with failed logins over the last 10 minutes')
  lines.push('# TYPE failed_login_unique_ips_10m gauge')
  lines.push(`failed_login_unique_ips_10m ${metrics.failed_login_unique_ips_10m}`)
  lines.push('# HELP contact_messages_10m Accepted contact submissions over the last 10 minutes')
  lines.push('# TYPE contact_messages_10m gauge')
  lines.push(`contact_messages_10m ${metrics.contact_messages_10m}`)
  lines.push('# HELP contact_messages_unique_ips_10m Unique IPs for accepted contact submissions over the last 10 minutes')
  lines.push('# TYPE contact_messages_unique_ips_10m gauge')
  lines.push(`contact_messages_unique_ips_10m ${metrics.contact_messages_unique_ips_10m}`)
  lines.push('# HELP contact_abuse_events_10m Contact abuse rejections over the last 10 minutes')
  lines.push('# TYPE contact_abuse_events_10m gauge')
  lines.push(`contact_abuse_events_10m ${metrics.contact_abuse_events_10m}`)
  lines.push('# HELP password_reset_requests_10m Password reset rows created over the last 10 minutes')
  lines.push('# TYPE password_reset_requests_10m gauge')
  lines.push(`password_reset_requests_10m ${metrics.password_reset_requests_10m}`)
  lines.push('# HELP admin_unlocks_24h Admin unlock actions over the last 24 hours')
  lines.push('# TYPE admin_unlocks_24h gauge')
  lines.push(`admin_unlocks_24h ${metrics.admin_unlocks_24h}`)
  lines.push('# HELP suspicious_admin_actions_24h Admin unlock and export actions over the last 24 hours')
  lines.push('# TYPE suspicious_admin_actions_24h gauge')
  lines.push(`suspicious_admin_actions_24h ${metrics.suspicious_admin_actions_24h}`)
  lines.push('# HELP contact_messages_total Total accepted contact submissions observed by the app')
  lines.push('# TYPE contact_messages_total gauge')
  lines.push(`contact_messages_total ${metrics.contact_messages_total}`)
  lines.push('# HELP contact_abuse_total Total rejected contact abuse events observed by the app')
  lines.push('# TYPE contact_abuse_total gauge')
  lines.push(`contact_abuse_total ${metrics.contact_abuse_total}`)
  lines.push('# HELP password_reset_requests_total Total forgot-password requests observed by the app')
  lines.push('# TYPE password_reset_requests_total gauge')
  lines.push(`password_reset_requests_total ${metrics.password_reset_requests_total}`)
  lines.push('# HELP password_reset_unknown_email_total Total forgot-password requests for unknown accounts observed by the app')
  lines.push('# TYPE password_reset_unknown_email_total gauge')
  lines.push(`password_reset_unknown_email_total ${metrics.password_reset_unknown_email_total}`)
  lines.push('# HELP admin_unlocks_total Total admin unlock actions observed by the app')
  lines.push('# TYPE admin_unlocks_total gauge')
  lines.push(`admin_unlocks_total ${metrics.admin_unlocks_total}`)
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
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end('error')
  }
})

server.listen(port, () => console.log('Exporter listening on port', port))
