#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')
const { runWithMaintenanceRecord } = require('./lib/maintenance_run_logger')

for (const filename of ['.env.local', '.env']) {
  const envPath = path.resolve(process.cwd(), filename)
  if (!fs.existsSync(envPath)) continue
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const value = line.trim()
    if (!value || value.startsWith('#')) continue
    const separator = value.indexOf('=')
    if (separator < 1) continue
    const key = value.slice(0, separator).trim()
    const raw = value.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) process.env[key] = raw
  }
  break
}

function retentionDays(name, fallback) {
  const value = Number(process.env[name] || fallback)
  if (!Number.isInteger(value) || value < 1 || value > 3650) throw new Error(`${name} must be an integer between 1 and 3650`)
  return value
}

function getPolicies() {
  return [
    { name: 'expired_rate_limiter_counts', count: 'SELECT COUNT(*) AS total FROM rate_limiter_counts WHERE expires_at < NOW()', remove: 'DELETE FROM rate_limiter_counts WHERE expires_at < NOW()' },
    { name: 'expired_auth_locks', count: 'SELECT COUNT(*) AS total FROM auth_locks WHERE locked_until < NOW()', remove: 'DELETE FROM auth_locks WHERE locked_until < NOW()' },
    { name: 'two_factor_codes', count: `SELECT COUNT(*) AS total FROM two_factor_codes WHERE created_at < NOW() - INTERVAL ${retentionDays('TWO_FACTOR_RETENTION_DAYS', 7)} DAY`, remove: `DELETE FROM two_factor_codes WHERE created_at < NOW() - INTERVAL ${retentionDays('TWO_FACTOR_RETENTION_DAYS', 7)} DAY` },
    { name: 'csp_reports', count: `SELECT COUNT(*) AS total FROM csp_reports WHERE received_at < NOW() - INTERVAL ${retentionDays('CSP_REPORT_RETENTION_DAYS', 30)} DAY`, remove: `DELETE FROM csp_reports WHERE received_at < NOW() - INTERVAL ${retentionDays('CSP_REPORT_RETENTION_DAYS', 30)} DAY` },
    { name: 'password_resets', count: `SELECT COUNT(*) AS total FROM password_resets WHERE created_at < NOW() - INTERVAL ${retentionDays('PASSWORD_RESET_RETENTION_DAYS', 30)} DAY`, remove: `DELETE FROM password_resets WHERE created_at < NOW() - INTERVAL ${retentionDays('PASSWORD_RESET_RETENTION_DAYS', 30)} DAY` },
    { name: 'login_attempts', count: `SELECT COUNT(*) AS total FROM login_attempts WHERE created_at < NOW() - INTERVAL ${retentionDays('LOGIN_ATTEMPT_RETENTION_DAYS', 90)} DAY`, remove: `DELETE FROM login_attempts WHERE created_at < NOW() - INTERVAL ${retentionDays('LOGIN_ATTEMPT_RETENTION_DAYS', 90)} DAY` },
    { name: 'admin_actions', count: `SELECT COUNT(*) AS total FROM admin_actions WHERE created_at < NOW() - INTERVAL ${retentionDays('ADMIN_ACTION_RETENTION_DAYS', 365)} DAY`, remove: `DELETE FROM admin_actions WHERE created_at < NOW() - INTERVAL ${retentionDays('ADMIN_ACTION_RETENTION_DAYS', 365)} DAY` },
    { name: 'completed_deletion_logs', count: `SELECT COUNT(*) AS total FROM content_deletion_log WHERE cleanup_status IN ('complete', 'cancelled') AND created_at < NOW() - INTERVAL ${retentionDays('DELETION_LOG_RETENTION_DAYS', 365)} DAY`, remove: `DELETE FROM content_deletion_log WHERE cleanup_status IN ('complete', 'cancelled') AND created_at < NOW() - INTERVAL ${retentionDays('DELETION_LOG_RETENTION_DAYS', 365)} DAY` },
    { name: 'maintenance_runs', count: `SELECT COUNT(*) AS total FROM maintenance_runs WHERE started_at < NOW() - INTERVAL ${retentionDays('MAINTENANCE_RUN_RETENTION_DAYS', 365)} DAY`, remove: `DELETE FROM maintenance_runs WHERE started_at < NOW() - INTERVAL ${retentionDays('MAINTENANCE_RUN_RETENTION_DAYS', 365)} DAY` },
  ]
}

async function main() {
  const apply = process.argv.slice(2).includes('--apply')
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  })

  const results = []
  try {
    if (apply) await connection.beginTransaction()
    for (const policy of getPolicies()) {
      const [rows] = await connection.query(policy.count)
      const matched = Number(rows?.[0]?.total || 0)
      let deleted = 0
      if (apply && matched > 0) {
        const [result] = await connection.query(policy.remove)
        deleted = Number(result?.affectedRows || 0)
      }
      results.push({ policy: policy.name, matched, deleted })
    }
    if (apply) await connection.commit()
  } catch (error) {
    if (apply) await connection.rollback()
    throw error
  } finally {
    await connection.end()
  }

  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', results }, null, 2))
  return {
    status: apply ? 'ok' : 'warning',
    summary: `${apply ? 'Applied' : 'Previewed'} operational data retention policies.`,
    meta: { apply, results },
  }
}

runWithMaintenanceRecord('cleanup_operational_data', {
  commandText: 'node scripts/cleanup_operational_data.js',
}, () => main()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
