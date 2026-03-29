import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { query } from '@/lib/db'
import { createObjectStorageClient, getObjectStorageBucket } from '@/lib/objectStorage'
import { getRedis } from '@/lib/rateLimiter'
import { getRedisUrl } from '@/lib/rateLimiterConfig'

export const dynamic = 'force-dynamic'

type DependencyStatus = {
  ok: boolean
  error?: string
  latencyMs?: number
}

const HEALTH_TIMEOUT_MS = 1500
const CONTACT_ABUSE_REASONS = [
  'honeypot',
  'turnstile_missing',
  'turnstile_failed',
  'file_too_large',
  'total_size_exceeded',
  'unsupported_file_type',
]

function numEnv(name: string, fallback: number) {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function statusFor(value: number, warnAt: number, criticalAt: number) {
  if (value >= criticalAt) return 'critical'
  if (value >= warnAt) return 'warning'
  return 'ok'
}

function collectMissingConfig() {
  const required = ['NEXTAUTH_SECRET', 'NEXT_PUBLIC_S3_BUCKET', 'DB_HOST', 'DB_USER', 'DB_NAME']
  const missing = required.filter((key) => !process.env[key])
  try {
    getRedisUrl()
  } catch {
    missing.push('REDIS_URL')
  }
  return missing
}

async function withTimeout<T>(label: string, operation: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
  })

  try {
    return await Promise.race([operation(), timeoutPromise])
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
}

async function probeDependency(label: string, operation: () => Promise<void>): Promise<DependencyStatus> {
  const startedAt = Date.now()
  try {
    await withTimeout(label, operation, HEALTH_TIMEOUT_MS)
    return { ok: true, latencyMs: Date.now() - startedAt }
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) }
  }
}

async function buildHealthSummary() {
  const missing = collectMissingConfig()
  const dependencies = {
    mysql: await probeDependency('mysql', async () => {
      await query('SELECT 1 AS ok')
    }),
    redis: await probeDependency('redis', async () => {
      const redis = await getRedis()
      if (!redis) throw new Error('Redis client unavailable')
      if (typeof redis.exists !== 'function') throw new Error('Redis exists probe unavailable')
      await redis.exists('health:probe:missing')
    }),
    objectStorage: await probeDependency('objectStorage', async () => {
      const bucket = getObjectStorageBucket()
      if (!bucket) throw new Error('Object storage bucket not configured')
      const client = createObjectStorageClient()
      const exists = await client.bucketExists(bucket)
      if (!exists) throw new Error(`Bucket not found: ${bucket}`)
    }),
  }

  return {
    ok: missing.length === 0 && Object.values(dependencies).every((dependency) => dependency.ok),
    missing,
    timeoutMs: HEALTH_TIMEOUT_MS,
    dependencies,
  }
}

async function buildAbuseSummary() {
  const placeholders = CONTACT_ABUSE_REASONS.map(() => '?').join(', ')
  const [
    failedLoginsRows,
    contactMessagesRows,
    contactAbuseRows,
    passwordResetsRows,
    adminUnlocksRows,
    suspiciousAdminActionsRows,
  ] = await Promise.all([
    query<Array<{ cnt: number }>>('SELECT COUNT(*) as cnt FROM login_attempts WHERE success = 0 AND created_at > NOW() - INTERVAL 10 MINUTE'),
    query<Array<{ cnt: number }>>('SELECT COUNT(*) as cnt FROM messages WHERE is_deleted = 0 AND created_at > NOW() - INTERVAL 10 MINUTE'),
    query<Array<{ cnt: number }>>(`SELECT COUNT(*) as cnt FROM login_attempts WHERE success = 0 AND reason IN (${placeholders}) AND created_at > NOW() - INTERVAL 10 MINUTE`, CONTACT_ABUSE_REASONS),
    query<Array<{ cnt: number }>>('SELECT COUNT(*) as cnt FROM password_resets WHERE created_at > NOW() - INTERVAL 10 MINUTE'),
    query<Array<{ cnt: number }>>('SELECT COUNT(*) as cnt FROM admin_actions WHERE action = ? AND created_at > NOW() - INTERVAL 24 HOUR', ['unlock']),
    query<Array<{ cnt: number }>>('SELECT COUNT(*) as cnt FROM admin_actions WHERE action IN (?, ?) AND created_at > NOW() - INTERVAL 24 HOUR', ['unlock', 'export']),
  ])

  const thresholds = {
    failedLogins10m: { warn: numEnv('ABUSE_FAILED_LOGINS_WARN', 25), critical: numEnv('ABUSE_FAILED_LOGINS_CRITICAL', 50) },
    contactAbuse10m: { warn: numEnv('ABUSE_CONTACT_WARN', 5), critical: numEnv('ABUSE_CONTACT_CRITICAL', 10) },
    passwordResets10m: { warn: numEnv('ABUSE_PASSWORD_RESETS_WARN', 10), critical: numEnv('ABUSE_PASSWORD_RESETS_CRITICAL', 20) },
    adminUnlocks24h: { warn: numEnv('ABUSE_ADMIN_UNLOCKS_WARN', 3), critical: numEnv('ABUSE_ADMIN_UNLOCKS_CRITICAL', 6) },
    suspiciousAdminActions24h: { warn: numEnv('ABUSE_ADMIN_ACTIONS_WARN', 5), critical: numEnv('ABUSE_ADMIN_ACTIONS_CRITICAL', 10) },
  }

  const summary = {
    failedLogins10m: Number(failedLoginsRows[0]?.cnt || 0),
    contactMessages10m: Number(contactMessagesRows[0]?.cnt || 0),
    contactAbuse10m: Number(contactAbuseRows[0]?.cnt || 0),
    passwordResets10m: Number(passwordResetsRows[0]?.cnt || 0),
    adminUnlocks24h: Number(adminUnlocksRows[0]?.cnt || 0),
    suspiciousAdminActions24h: Number(suspiciousAdminActionsRows[0]?.cnt || 0),
  }

  const statuses = {
    failedLogins10m: statusFor(summary.failedLogins10m, thresholds.failedLogins10m.warn, thresholds.failedLogins10m.critical),
    contactAbuse10m: statusFor(summary.contactAbuse10m, thresholds.contactAbuse10m.warn, thresholds.contactAbuse10m.critical),
    passwordResets10m: statusFor(summary.passwordResets10m, thresholds.passwordResets10m.warn, thresholds.passwordResets10m.critical),
    adminUnlocks24h: statusFor(summary.adminUnlocks24h, thresholds.adminUnlocks24h.warn, thresholds.adminUnlocks24h.critical),
    suspiciousAdminActions24h: statusFor(summary.suspiciousAdminActions24h, thresholds.suspiciousAdminActions24h.warn, thresholds.suspiciousAdminActions24h.critical),
  }

  const overallStatus = Object.values(statuses).some((value) => value === 'critical')
    ? 'critical'
    : Object.values(statuses).some((value) => value === 'warning')
      ? 'warning'
      : 'ok'

  return { summary, statuses, thresholds, overallStatus }
}

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [health, abuse] = await Promise.all([buildHealthSummary(), buildAbuseSummary()])

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    health,
    abuse,
    storagePolicy: {
      target: 'Store all non-logo images in object storage (S3/MinIO).',
      exception: 'Brand/logo assets can remain in app files when they are static build assets.',
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}