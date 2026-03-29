#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')

const CONTACT_ABUSE_REASONS = [
  'honeypot',
  'turnstile_missing',
  'turnstile_failed',
  'file_too_large',
  'total_size_exceeded',
  'unsupported_file_type',
]

function loadEnv(file = '.env.local') {
  try {
    const filePath = path.resolve(process.cwd(), file)
    const content = fs.readFileSync(filePath, 'utf8')
    content.split(/\r?\n/).forEach((line) => {
      const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*)\s*$/)
      if (!match) return
      const key = match[1].trim()
      let value = match[2].trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = value
    })
  } catch {}
}

function getFlag(name) {
  return process.argv.includes(name)
}

function numEnv(name, fallback) {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function statusFor(value, warnAt, criticalAt) {
  if (value >= criticalAt) return 'critical'
  if (value >= warnAt) return 'warning'
  return 'ok'
}

async function main() {
  loadEnv('.env.local')
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'kf8fvd',
  })

  try {
    const placeholders = CONTACT_ABUSE_REASONS.map(() => '?').join(', ')
    const [[failedLogins10m]] = await conn.execute('SELECT COUNT(*) as cnt FROM login_attempts WHERE success = 0 AND created_at > NOW() - INTERVAL 10 MINUTE')
    const [failedLoginTopIps] = await conn.execute('SELECT ip, COUNT(*) as cnt FROM login_attempts WHERE success = 0 AND ip IS NOT NULL AND ip <> "" AND created_at > NOW() - INTERVAL 10 MINUTE GROUP BY ip ORDER BY cnt DESC LIMIT 10')
    const [failedLoginTopEmails] = await conn.execute('SELECT email, COUNT(*) as cnt FROM login_attempts WHERE success = 0 AND email IS NOT NULL AND email <> "" AND created_at > NOW() - INTERVAL 10 MINUTE GROUP BY email ORDER BY cnt DESC LIMIT 10')
    const [[contactMessages10m]] = await conn.execute('SELECT COUNT(*) as cnt FROM messages WHERE is_deleted = 0 AND created_at > NOW() - INTERVAL 10 MINUTE')
    const [contactTopIps] = await conn.execute('SELECT ip, COUNT(*) as cnt FROM messages WHERE is_deleted = 0 AND ip IS NOT NULL AND ip <> "" AND created_at > NOW() - INTERVAL 10 MINUTE GROUP BY ip ORDER BY cnt DESC LIMIT 10')
    const [[contactAbuse10m]] = await conn.execute(`SELECT COUNT(*) as cnt FROM login_attempts WHERE success = 0 AND reason IN (${placeholders}) AND created_at > NOW() - INTERVAL 10 MINUTE`, CONTACT_ABUSE_REASONS)
    const [contactAbuseReasons] = await conn.execute(`SELECT reason, COUNT(*) as cnt FROM login_attempts WHERE success = 0 AND reason IN (${placeholders}) AND created_at > NOW() - INTERVAL 10 MINUTE GROUP BY reason ORDER BY cnt DESC`, CONTACT_ABUSE_REASONS)
    const [[passwordResets10m]] = await conn.execute('SELECT COUNT(*) as cnt FROM password_resets WHERE created_at > NOW() - INTERVAL 10 MINUTE')
    const [passwordResetTopEmails] = await conn.execute('SELECT email, COUNT(*) as cnt FROM password_resets WHERE created_at > NOW() - INTERVAL 10 MINUTE GROUP BY email ORDER BY cnt DESC LIMIT 10')
    const [[adminUnlocks24h]] = await conn.execute('SELECT COUNT(*) as cnt FROM admin_actions WHERE action = ? AND created_at > NOW() - INTERVAL 24 HOUR', ['unlock'])
    const [adminUnlockActors] = await conn.execute('SELECT actor, COUNT(*) as cnt FROM admin_actions WHERE action = ? AND created_at > NOW() - INTERVAL 24 HOUR GROUP BY actor ORDER BY cnt DESC LIMIT 10', ['unlock'])
    const [[suspiciousAdminActions24h]] = await conn.execute('SELECT COUNT(*) as cnt FROM admin_actions WHERE action IN (?, ?) AND created_at > NOW() - INTERVAL 24 HOUR', ['unlock', 'export'])
    const [suspiciousAdminBreakdown] = await conn.execute('SELECT action, actor, COUNT(*) as cnt FROM admin_actions WHERE action IN (?, ?) AND created_at > NOW() - INTERVAL 24 HOUR GROUP BY action, actor ORDER BY cnt DESC LIMIT 20', ['unlock', 'export'])

    const report = {
      generatedAt: new Date().toISOString(),
      thresholds: {
        failedLogins10m: { warn: numEnv('ABUSE_FAILED_LOGINS_WARN', 25), critical: numEnv('ABUSE_FAILED_LOGINS_CRITICAL', 50) },
        contactAbuse10m: { warn: numEnv('ABUSE_CONTACT_WARN', 5), critical: numEnv('ABUSE_CONTACT_CRITICAL', 10) },
        passwordResets10m: { warn: numEnv('ABUSE_PASSWORD_RESETS_WARN', 10), critical: numEnv('ABUSE_PASSWORD_RESETS_CRITICAL', 20) },
        adminUnlocks24h: { warn: numEnv('ABUSE_ADMIN_UNLOCKS_WARN', 3), critical: numEnv('ABUSE_ADMIN_UNLOCKS_CRITICAL', 6) },
        suspiciousAdminActions24h: { warn: numEnv('ABUSE_ADMIN_ACTIONS_WARN', 5), critical: numEnv('ABUSE_ADMIN_ACTIONS_CRITICAL', 10) },
      },
      failedLogins10m: {
        count: Number(failedLogins10m.cnt || 0),
        topIps: failedLoginTopIps,
        topEmails: failedLoginTopEmails,
      },
      contactMessages10m: {
        count: Number(contactMessages10m.cnt || 0),
        topIps: contactTopIps,
      },
      contactAbuse10m: {
        count: Number(contactAbuse10m.cnt || 0),
        byReason: contactAbuseReasons,
      },
      passwordResets10m: {
        count: Number(passwordResets10m.cnt || 0),
        topEmails: passwordResetTopEmails,
      },
      adminUnlocks24h: {
        count: Number(adminUnlocks24h.cnt || 0),
        topActors: adminUnlockActors,
      },
      suspiciousAdminActions24h: {
        count: Number(suspiciousAdminActions24h.cnt || 0),
        breakdown: suspiciousAdminBreakdown,
      },
    }

    report.failedLogins10m.status = statusFor(report.failedLogins10m.count, report.thresholds.failedLogins10m.warn, report.thresholds.failedLogins10m.critical)
    report.contactAbuse10m.status = statusFor(report.contactAbuse10m.count, report.thresholds.contactAbuse10m.warn, report.thresholds.contactAbuse10m.critical)
    report.passwordResets10m.status = statusFor(report.passwordResets10m.count, report.thresholds.passwordResets10m.warn, report.thresholds.passwordResets10m.critical)
    report.adminUnlocks24h.status = statusFor(report.adminUnlocks24h.count, report.thresholds.adminUnlocks24h.warn, report.thresholds.adminUnlocks24h.critical)
    report.suspiciousAdminActions24h.status = statusFor(report.suspiciousAdminActions24h.count, report.thresholds.suspiciousAdminActions24h.warn, report.thresholds.suspiciousAdminActions24h.critical)

    const sections = [
      report.failedLogins10m,
      report.contactAbuse10m,
      report.passwordResets10m,
      report.adminUnlocks24h,
      report.suspiciousAdminActions24h,
    ]
    report.overallStatus = sections.some((section) => section.status === 'critical') ? 'critical' : sections.some((section) => section.status === 'warning') ? 'warning' : 'ok'

    if (getFlag('--json')) {
      console.log(JSON.stringify(report, null, 2))
    } else {
      console.log(`abuse monitor report: ${report.overallStatus}`)
      console.log(`failedLogins10m=${report.failedLogins10m.count} status=${report.failedLogins10m.status}`)
      console.log(`contactMessages10m=${report.contactMessages10m.count}`)
      console.log(`contactAbuse10m=${report.contactAbuse10m.count} status=${report.contactAbuse10m.status}`)
      console.log(`passwordResets10m=${report.passwordResets10m.count} status=${report.passwordResets10m.status}`)
      console.log(`adminUnlocks24h=${report.adminUnlocks24h.count} status=${report.adminUnlocks24h.status}`)
      console.log(`suspiciousAdminActions24h=${report.suspiciousAdminActions24h.count} status=${report.suspiciousAdminActions24h.status}`)
      if (report.failedLogins10m.topIps.length) console.log(`topFailedLoginIps=${JSON.stringify(report.failedLogins10m.topIps)}`)
      if (report.contactAbuse10m.byReason.length) console.log(`contactAbuseReasons=${JSON.stringify(report.contactAbuse10m.byReason)}`)
      if (report.passwordResets10m.topEmails.length) console.log(`topPasswordResetEmails=${JSON.stringify(report.passwordResets10m.topEmails)}`)
      if (report.suspiciousAdminActions24h.breakdown.length) console.log(`suspiciousAdminBreakdown=${JSON.stringify(report.suspiciousAdminActions24h.breakdown)}`)
    }

    if (report.overallStatus === 'critical') process.exitCode = 2
    else if (report.overallStatus === 'warning') process.exitCode = 1
  } finally {
    await conn.end()
  }
}

main().catch((error) => {
  console.error('abuse monitor failed', error)
  process.exit(2)
})