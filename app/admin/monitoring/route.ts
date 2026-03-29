import os from 'node:os'
import tls from 'node:tls'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { query } from '@/lib/db'
import { createObjectStorageClient, getObjectStorageBucket } from '@/lib/objectStorage'
import { getRouteActivitySummary } from '@/lib/monitoringMetrics'
import { getRateLimiterBackendStatus, getRedis } from '@/lib/rateLimiter'
import { getRedisUrl } from '@/lib/rateLimiterConfig'

export const dynamic = 'force-dynamic'

type MetricStatus = 'ok' | 'warning' | 'critical'

type DependencyStatus = {
  ok: boolean
  error?: string
  latencyMs?: number
}

type StorageObject = {
  key: string
  prefix: string
  size: number
  lastModified: string | null
}

type StoragePrefixSummary = {
  prefix: string
  objectCount: number
  totalBytes: number
  newestObjectAt: string | null
  recent24hBytes: number
  recent24hObjects: number
}

type BucketPoint = {
  label: string
  startedAt: string
  value: number
}

const HEALTH_TIMEOUT_MS = 1500
const STORAGE_PREFIXES = ['projects/', 'pages/', 'about/', 'credentials/', 'hero/', 'messages/']
const CONTACT_ABUSE_REASONS = [
  'honeypot',
  'turnstile_missing',
  'turnstile_failed',
  'file_too_large',
  'total_size_exceeded',
  'unsupported_file_type',
]

const MAINTENANCE_TASKS = [
  { name: 'release_verify', label: 'Release verification', command: 'npm run verify:release', href: '/admin/utilities/monitoring', expectedHours: 24 },
  { name: 'storage_orphan_audit', label: 'Storage orphan audit', command: 'npm run storage:audit-orphans', href: '/admin/projects', expectedHours: 24 },
  { name: 'cleanup_generated_artifacts', label: 'Generated artifact cleanup', command: 'npm run cleanup:artifacts -- --apply', href: '/admin/utilities', expectedHours: 24 },
  { name: 'cleanup_admin_actions', label: 'Admin action cleanup', command: 'npm run cleanup:admin_actions', href: '/admin/audit', expectedHours: 48 },
  { name: 'abuse_monitor_report', label: 'Abuse monitor report', command: 'npm run monitor:abuse', href: '/admin/utilities/monitoring', expectedHours: 24 },
  { name: 'backup_restore_drill', label: 'Backup restore drill', command: 'npm run backup:drill', href: '/admin/utilities', expectedHours: 24 * 7 },
]

function numEnv(name: string, fallback: number) {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function statusFor(value: number, warnAt: number, criticalAt: number): MetricStatus {
  if (value >= criticalAt) return 'critical'
  if (value >= warnAt) return 'warning'
  return 'ok'
}

function statusForRatio(value: number, warnAt: number, criticalAt: number): MetricStatus {
  if (value >= criticalAt) return 'critical'
  if (value >= warnAt) return 'warning'
  return 'ok'
}

function thresholdExplanation(label: string, value: number, warnAt: number, criticalAt: number, unit = '') {
  const suffix = unit ? ` ${unit}` : ''
  return `${label} is ${value}${suffix}. Warning at ${warnAt}${suffix}, critical at ${criticalAt}${suffix}.`
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

function zeroDatabaseCounts() {
  return {
    projects: 0,
    pages: 0,
    aboutCards: 0,
    credentials: 0,
    credentialSections: 0,
    messages: 0,
    unreadMessages: 0,
    users: 0,
  }
}

function countAboutCards(pageRows: Array<{ metadata?: string | null }>) {
  let aboutCards = 0
  for (const row of pageRows || []) {
    try {
      const metadata = row.metadata ? JSON.parse(String(row.metadata)) : null
      if (!metadata) continue
      if (Array.isArray(metadata.cards) && metadata.cards.length > 0) {
        aboutCards += metadata.cards.length
        continue
      }
      if (metadata.aboutCard) aboutCards += 1
      if (metadata.topologyCard) aboutCards += 1
      if (metadata.hamshackCard) aboutCards += 1
    } catch {
      continue
    }
  }
  return aboutCards
}

function toHourlySeries(rows: Array<{ bucket_ms: number; cnt: number }>, hours = 24): BucketPoint[] {
  const now = new Date()
  const currentHour = new Date(now)
  currentHour.setMinutes(0, 0, 0)
  const rowMap = new Map(rows.map((row) => [Number(row.bucket_ms), Number(row.cnt || 0)]))
  const points: BucketPoint[] = []
  for (let index = hours - 1; index >= 0; index -= 1) {
    const date = new Date(currentHour.getTime() - (index * 60 * 60 * 1000))
    const bucketMs = date.getTime()
    points.push({
      label: date.toLocaleTimeString([], { hour: 'numeric' }),
      startedAt: date.toISOString(),
      value: rowMap.get(bucketMs) || 0,
    })
  }
  return points
}

async function queryHourlyCounts(sql: string, params?: ReadonlyArray<unknown>) {
  return query<Array<{ bucket_ms: number; cnt: number }>>(sql, params)
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
    failedLoginsTrendRows,
    contactMessagesTrendRows,
    contactAbuseTrendRows,
    passwordResetsTrendRows,
  ] = await Promise.all([
    query<Array<{ cnt: number }>>('SELECT COUNT(*) as cnt FROM login_attempts WHERE success = 0 AND created_at > NOW() - INTERVAL 10 MINUTE'),
    query<Array<{ cnt: number }>>('SELECT COUNT(*) as cnt FROM messages WHERE is_deleted = 0 AND created_at > NOW() - INTERVAL 10 MINUTE'),
    query<Array<{ cnt: number }>>(`SELECT COUNT(*) as cnt FROM login_attempts WHERE success = 0 AND reason IN (${placeholders}) AND created_at > NOW() - INTERVAL 10 MINUTE`, CONTACT_ABUSE_REASONS),
    query<Array<{ cnt: number }>>('SELECT COUNT(*) as cnt FROM password_resets WHERE created_at > NOW() - INTERVAL 10 MINUTE'),
    query<Array<{ cnt: number }>>('SELECT COUNT(*) as cnt FROM admin_actions WHERE action = ? AND created_at > NOW() - INTERVAL 24 HOUR', ['unlock']),
    query<Array<{ cnt: number }>>('SELECT COUNT(*) as cnt FROM admin_actions WHERE action IN (?, ?) AND created_at > NOW() - INTERVAL 24 HOUR', ['unlock', 'export']),
    queryHourlyCounts('SELECT UNIX_TIMESTAMP(DATE_FORMAT(created_at, "%Y-%m-%d %H:00:00")) * 1000 as bucket_ms, COUNT(*) as cnt FROM login_attempts WHERE success = 0 AND created_at > NOW() - INTERVAL 24 HOUR GROUP BY bucket_ms ORDER BY bucket_ms ASC'),
    queryHourlyCounts('SELECT UNIX_TIMESTAMP(DATE_FORMAT(created_at, "%Y-%m-%d %H:00:00")) * 1000 as bucket_ms, COUNT(*) as cnt FROM messages WHERE is_deleted = 0 AND created_at > NOW() - INTERVAL 24 HOUR GROUP BY bucket_ms ORDER BY bucket_ms ASC'),
    queryHourlyCounts(`SELECT UNIX_TIMESTAMP(DATE_FORMAT(created_at, "%Y-%m-%d %H:00:00")) * 1000 as bucket_ms, COUNT(*) as cnt FROM login_attempts WHERE success = 0 AND reason IN (${placeholders}) AND created_at > NOW() - INTERVAL 24 HOUR GROUP BY bucket_ms ORDER BY bucket_ms ASC`, CONTACT_ABUSE_REASONS),
    queryHourlyCounts('SELECT UNIX_TIMESTAMP(DATE_FORMAT(created_at, "%Y-%m-%d %H:00:00")) * 1000 as bucket_ms, COUNT(*) as cnt FROM password_resets WHERE created_at > NOW() - INTERVAL 24 HOUR GROUP BY bucket_ms ORDER BY bucket_ms ASC'),
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

  return {
    summary,
    statuses,
    thresholds,
    explanations: {
      failedLogins10m: thresholdExplanation('Failed logins / 10m', summary.failedLogins10m, thresholds.failedLogins10m.warn, thresholds.failedLogins10m.critical),
      contactAbuse10m: thresholdExplanation('Contact abuse / 10m', summary.contactAbuse10m, thresholds.contactAbuse10m.warn, thresholds.contactAbuse10m.critical),
      passwordResets10m: thresholdExplanation('Password resets / 10m', summary.passwordResets10m, thresholds.passwordResets10m.warn, thresholds.passwordResets10m.critical),
      adminUnlocks24h: thresholdExplanation('Admin unlocks / 24h', summary.adminUnlocks24h, thresholds.adminUnlocks24h.warn, thresholds.adminUnlocks24h.critical),
      suspiciousAdminActions24h: thresholdExplanation('Suspicious admin actions / 24h', summary.suspiciousAdminActions24h, thresholds.suspiciousAdminActions24h.warn, thresholds.suspiciousAdminActions24h.critical),
    },
    trends: {
      failedLogins24h: toHourlySeries(failedLoginsTrendRows),
      contactMessages24h: toHourlySeries(contactMessagesTrendRows),
      contactAbuse24h: toHourlySeries(contactAbuseTrendRows),
      passwordResets24h: toHourlySeries(passwordResetsTrendRows),
    },
    overallStatus,
  }
}

async function listManagedObjects(): Promise<StorageObject[]> {
  const bucket = getObjectStorageBucket()
  if (!bucket) return []
  const client = createObjectStorageClient()
  const objects: StorageObject[] = []

  for (const prefix of STORAGE_PREFIXES) {
    const stream = client.listObjectsV2(bucket, prefix, true)
    for await (const object of stream) {
      if (!object?.name) continue
      objects.push({
        key: object.name,
        prefix,
        size: Number(object.size || 0),
        lastModified: object.lastModified ? new Date(object.lastModified).toISOString() : null,
      })
    }
  }

  return objects
}

function buildStorageTrendPoints(objects: StorageObject[], bucketHours: number, pointCount: number) {
  const bucketMs = bucketHours * 60 * 60 * 1000
  const now = Date.now()
  const start = Math.floor(now / bucketMs) * bucketMs
  const points: BucketPoint[] = []
  for (let index = pointCount - 1; index >= 0; index -= 1) {
    const bucketStartMs = start - (index * bucketMs)
    const bucketEndMs = bucketStartMs + bucketMs
    const matched = objects.filter((object) => {
      if (!object.lastModified) return false
      const modifiedAt = new Date(object.lastModified).getTime()
      return modifiedAt >= bucketStartMs && modifiedAt < bucketEndMs
    })
    points.push({
      label: bucketHours >= 24 ? new Date(bucketStartMs).toLocaleDateString([], { month: 'short', day: 'numeric' }) : new Date(bucketStartMs).toLocaleTimeString([], { hour: 'numeric' }),
      startedAt: new Date(bucketStartMs).toISOString(),
      value: matched.reduce((sum, object) => sum + object.size, 0),
    })
  }
  return points
}

async function buildStorageSummary() {
  const bucket = getObjectStorageBucket()
  if (!bucket) {
    return {
      status: 'critical' as MetricStatus,
      bucket: '',
      totals: { objectCount: 0, totalBytes: 0, prefixesTracked: STORAGE_PREFIXES.length, recent24hBytes: 0, recent7dBytes: 0, softLimitBytes: numEnv('MONITOR_STORAGE_SOFT_LIMIT_BYTES', 0), usageRatio: null as number | null },
      prefixes: [] as StoragePrefixSummary[],
      newestObjectAt: null,
      topRecentObjects: [] as Array<{ key: string; size: number; lastModified: string | null }>,
      trends: { last24hBytes: [] as BucketPoint[], last7dBytes: [] as BucketPoint[] },
      error: 'Object storage bucket not configured',
    }
  }

  try {
    const objects = await withTimeout('storage-metrics', () => listManagedObjects(), HEALTH_TIMEOUT_MS * 4)
    const now = Date.now()
    const softLimitBytes = numEnv('MONITOR_STORAGE_SOFT_LIMIT_BYTES', 0)
    const totalBytes = objects.reduce((sum, object) => sum + object.size, 0)
    const recent24hObjects = objects.filter((object) => object.lastModified && (now - new Date(object.lastModified).getTime()) <= 24 * 60 * 60 * 1000)
    const recent7dObjects = objects.filter((object) => object.lastModified && (now - new Date(object.lastModified).getTime()) <= 7 * 24 * 60 * 60 * 1000)

    const prefixes = STORAGE_PREFIXES.map((prefix) => {
      const entries = objects.filter((object) => object.prefix === prefix)
      const newestObjectAt = entries.reduce<string | null>((latest, entry) => {
        if (!entry.lastModified) return latest
        if (!latest || entry.lastModified > latest) return entry.lastModified
        return latest
      }, null)
      const recentEntries = entries.filter((entry) => entry.lastModified && (now - new Date(entry.lastModified).getTime()) <= 24 * 60 * 60 * 1000)
      return {
        prefix,
        objectCount: entries.length,
        totalBytes: entries.reduce((sum, entry) => sum + entry.size, 0),
        newestObjectAt,
        recent24hBytes: recentEntries.reduce((sum, entry) => sum + entry.size, 0),
        recent24hObjects: recentEntries.length,
      }
    })

    const usageRatio = softLimitBytes > 0 ? totalBytes / softLimitBytes : null
    const status = usageRatio == null ? 'ok' : statusForRatio(usageRatio, 0.7, 0.9)
    const newestObjectAt = objects.reduce<string | null>((latest, entry) => {
      if (!entry.lastModified) return latest
      if (!latest || entry.lastModified > latest) return entry.lastModified
      return latest
    }, null)

    return {
      status,
      bucket,
      totals: {
        objectCount: objects.length,
        totalBytes,
        prefixesTracked: STORAGE_PREFIXES.length,
        recent24hBytes: recent24hObjects.reduce((sum, object) => sum + object.size, 0),
        recent7dBytes: recent7dObjects.reduce((sum, object) => sum + object.size, 0),
        softLimitBytes,
        usageRatio,
      },
      prefixes,
      newestObjectAt,
      topRecentObjects: recent7dObjects.sort((a, b) => b.size - a.size).slice(0, 6).map((object) => ({ key: object.key, size: object.size, lastModified: object.lastModified })),
      trends: {
        last24hBytes: buildStorageTrendPoints(objects, 2, 12),
        last7dBytes: buildStorageTrendPoints(objects, 24, 7),
      },
      explanation: usageRatio == null
        ? 'No storage soft limit configured; showing raw managed object usage only.'
        : thresholdExplanation('Managed storage usage ratio', Number((usageRatio * 100).toFixed(1)), 70, 90, '% of soft limit'),
    }
  } catch (error) {
    return {
      status: 'critical' as MetricStatus,
      bucket,
      totals: { objectCount: 0, totalBytes: 0, prefixesTracked: STORAGE_PREFIXES.length, recent24hBytes: 0, recent7dBytes: 0, softLimitBytes: numEnv('MONITOR_STORAGE_SOFT_LIMIT_BYTES', 0), usageRatio: null as number | null },
      prefixes: [] as StoragePrefixSummary[],
      newestObjectAt: null,
      topRecentObjects: [] as Array<{ key: string; size: number; lastModified: string | null }>,
      trends: { last24hBytes: [] as BucketPoint[], last7dBytes: [] as BucketPoint[] },
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function buildServerSummary() {
  const memory = process.memoryUsage()
  const uptimeSeconds = Math.max(0, Math.floor(process.uptime()))
  const systemUsedRatio = os.totalmem() > 0 ? 1 - (os.freemem() / os.totalmem()) : 0
  const heapUsedRatio = memory.heapTotal > 0 ? memory.heapUsed / memory.heapTotal : 0
  const status = [
    statusForRatio(systemUsedRatio, 0.75, 0.9),
    statusForRatio(heapUsedRatio, 0.75, 0.9),
  ].includes('critical')
    ? 'critical'
    : [statusForRatio(systemUsedRatio, 0.75, 0.9), statusForRatio(heapUsedRatio, 0.75, 0.9)].includes('warning')
      ? 'warning'
      : 'ok'

  return {
    status,
    runtime: {
      nodeVersion: process.version,
      platform: `${process.platform}/${process.arch}`,
      hostname: os.hostname(),
      pid: process.pid,
      cpuCount: os.cpus().length,
    },
    uptimeSeconds,
    startedAt: new Date(Date.now() - uptimeSeconds * 1000).toISOString(),
    memory: {
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
      externalBytes: memory.external,
      arrayBuffersBytes: memory.arrayBuffers,
      systemTotalBytes: os.totalmem(),
      systemFreeBytes: os.freemem(),
      systemUsedRatio,
      heapUsedRatio,
    },
    loadAverage: os.loadavg().map((value) => Number(value.toFixed(2))),
    explanations: {
      systemMemory: thresholdExplanation('System memory used', Number((systemUsedRatio * 100).toFixed(1)), 75, 90, '%'),
      heapMemory: thresholdExplanation('Node heap used', Number((heapUsedRatio * 100).toFixed(1)), 75, 90, '%'),
    },
  }
}

async function buildDatabaseSummary() {
  try {
    const [
      projectRows,
      pageCountRows,
      pageMetadataRows,
      credentialRows,
      credentialSectionRows,
      messageRows,
      userRows,
      statusRows,
      variableRows,
      recentActivityRows,
      lastMessageRows,
      lastAdminActionRows,
      lastProjectUpdateRows,
      lastPageUpdateRows,
      lastCredentialUpdateRows,
    ] = await Promise.all([
      query<Array<{ total: number }>>('SELECT COUNT(*) as total FROM projects'),
      query<Array<{ total: number }>>('SELECT COUNT(*) as total FROM pages'),
      query<Array<{ metadata?: string | null }>>('SELECT metadata FROM pages'),
      query<Array<{ total: number }>>('SELECT COUNT(*) as total FROM credentials'),
      query<Array<{ total: number }>>('SELECT COUNT(*) as total FROM credential_sections'),
      query<Array<{ total: number; unread: number | null }>>('SELECT COUNT(*) as total, SUM(CASE WHEN is_deleted = 0 AND is_read = 0 THEN 1 ELSE 0 END) as unread FROM messages WHERE is_deleted = 0'),
      query<Array<{ total: number }>>('SELECT COUNT(*) as total FROM users'),
      query<Array<{ Variable_name: string; Value: string }>>('SHOW GLOBAL STATUS WHERE Variable_name IN ("Threads_connected", "Threads_running", "Slow_queries", "Uptime", "Questions", "Bytes_received", "Bytes_sent")'),
      query<Array<{ Variable_name: string; Value: string }>>('SHOW GLOBAL VARIABLES WHERE Variable_name IN ("max_connections")'),
      query<Array<{ login_attempts_24h: number; messages_24h: number; password_resets_24h: number; admin_actions_24h: number }>>('SELECT (SELECT COUNT(*) FROM login_attempts WHERE created_at > NOW() - INTERVAL 24 HOUR) as login_attempts_24h, (SELECT COUNT(*) FROM messages WHERE is_deleted = 0 AND created_at > NOW() - INTERVAL 24 HOUR) as messages_24h, (SELECT COUNT(*) FROM password_resets WHERE created_at > NOW() - INTERVAL 24 HOUR) as password_resets_24h, (SELECT COUNT(*) FROM admin_actions WHERE created_at > NOW() - INTERVAL 24 HOUR) as admin_actions_24h'),
      query<Array<{ last_created_at: string | null }>>('SELECT MAX(created_at) as last_created_at FROM messages WHERE is_deleted = 0'),
      query<Array<{ last_created_at: string | null }>>('SELECT MAX(created_at) as last_created_at FROM admin_actions'),
      query<Array<{ last_updated_at: string | null }>>('SELECT MAX(updated_at) as last_updated_at FROM projects'),
      query<Array<{ last_updated_at: string | null }>>('SELECT MAX(updated_at) as last_updated_at FROM pages'),
      query<Array<{ last_updated_at: string | null }>>('SELECT MAX(updated_at) as last_updated_at FROM credentials'),
    ])

    const counts = {
      projects: Number(projectRows[0]?.total || 0),
      pages: Number(pageCountRows[0]?.total || 0),
      aboutCards: countAboutCards(pageMetadataRows),
      credentials: Number(credentialRows[0]?.total || 0),
      credentialSections: Number(credentialSectionRows[0]?.total || 0),
      messages: Number(messageRows[0]?.total || 0),
      unreadMessages: Number(messageRows[0]?.unread || 0),
      users: Number(userRows[0]?.total || 0),
    }

    const statusMap = new Map(statusRows.map((row) => [row.Variable_name, Number(row.Value || 0)]))
    const variableMap = new Map(variableRows.map((row) => [row.Variable_name, Number(row.Value || 0)]))
    const threadsConnected = Number(statusMap.get('Threads_connected') || 0)
    const maxConnections = Number(variableMap.get('max_connections') || 0)
    const connectionUsageRatio = maxConnections > 0 ? threadsConnected / maxConnections : 0
    const dbStatus = statusForRatio(connectionUsageRatio, 0.7, 0.9)

    return {
      status: dbStatus,
      counts,
      totals: {
        contentRows: counts.projects + counts.pages + counts.aboutCards + counts.credentials + counts.credentialSections,
        accountRows: counts.users,
      },
      health: {
        uptimeSeconds: Number(statusMap.get('Uptime') || 0),
        threadsConnected,
        threadsRunning: Number(statusMap.get('Threads_running') || 0),
        maxConnections,
        connectionUsageRatio,
        slowQueries: Number(statusMap.get('Slow_queries') || 0),
        questions: Number(statusMap.get('Questions') || 0),
        bytesReceived: Number(statusMap.get('Bytes_received') || 0),
        bytesSent: Number(statusMap.get('Bytes_sent') || 0),
      },
      recentActivity: recentActivityRows[0] || { login_attempts_24h: 0, messages_24h: 0, password_resets_24h: 0, admin_actions_24h: 0 },
      lastChange: {
        lastMessageAt: lastMessageRows[0]?.last_created_at || null,
        lastAdminActionAt: lastAdminActionRows[0]?.last_created_at || null,
        lastContentUpdateAt: [lastProjectUpdateRows[0]?.last_updated_at, lastPageUpdateRows[0]?.last_updated_at, lastCredentialUpdateRows[0]?.last_updated_at].filter(Boolean).sort().slice(-1)[0] || null,
      },
      explanations: {
        connections: thresholdExplanation('Database connection usage', Number((connectionUsageRatio * 100).toFixed(1)), 70, 90, '% of max connections'),
      },
    }
  } catch (error) {
    return {
      status: 'critical' as MetricStatus,
      counts: zeroDatabaseCounts(),
      totals: { contentRows: 0, accountRows: 0 },
      health: {
        uptimeSeconds: 0,
        threadsConnected: 0,
        threadsRunning: 0,
        maxConnections: 0,
        connectionUsageRatio: 0,
        slowQueries: 0,
        questions: 0,
        bytesReceived: 0,
        bytesSent: 0,
      },
      recentActivity: { login_attempts_24h: 0, messages_24h: 0, password_resets_24h: 0, admin_actions_24h: 0 },
      lastChange: { lastMessageAt: null, lastAdminActionAt: null, lastContentUpdateAt: null },
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function parseRedisInfo(text: string) {
  const values: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf(':')
    if (separator === -1) continue
    values[line.slice(0, separator)] = line.slice(separator + 1)
  }
  return values
}

async function buildRedisSummary() {
  const backend = getRateLimiterBackendStatus()
  try {
    const redis = await getRedis() as ({ info?: (section?: string) => Promise<string>; dbsize?: () => Promise<number> } & Record<string, unknown>) | null
    if (!redis) {
      return {
        status: backend.redisConfigured ? 'critical' : 'warning',
        backend,
        error: backend.redisConfigured ? 'Redis unavailable; rate limiter may be using in-memory fallback.' : 'Redis not configured.',
      }
    }

    const infoText = typeof redis.info === 'function' ? await redis.info() : ''
    const info = parseRedisInfo(infoText)
    const usedMemoryBytes = Number(info.used_memory || 0)
    const maxMemoryBytes = Number(info.maxmemory || 0)
    const memoryRatio = maxMemoryBytes > 0 ? usedMemoryBytes / maxMemoryBytes : null
    const keyspaceHits = Number(info.keyspace_hits || 0)
    const keyspaceMisses = Number(info.keyspace_misses || 0)
    const hitRate = (keyspaceHits + keyspaceMisses) > 0 ? keyspaceHits / (keyspaceHits + keyspaceMisses) : null
    const evictedKeys = Number(info.evicted_keys || 0)
    const dbSize = typeof redis.dbsize === 'function' ? Number(await redis.dbsize()) : 0
    const statuses = [
      backend.redisTemporarilyDisabled ? 'warning' : 'ok',
      memoryRatio == null ? 'ok' : statusForRatio(memoryRatio, 0.75, 0.9),
      evictedKeys > 0 ? 'warning' : 'ok',
    ] as MetricStatus[]
    const status = statuses.includes('critical') ? 'critical' : statuses.includes('warning') ? 'warning' : 'ok'

    return {
      status,
      backend,
      stats: {
        usedMemoryBytes,
        usedMemoryPeakBytes: Number(info.used_memory_peak || 0),
        maxMemoryBytes,
        connectedClients: Number(info.connected_clients || 0),
        blockedClients: Number(info.blocked_clients || 0),
        evictedKeys,
        keyspaceHits,
        keyspaceMisses,
        hitRate,
        opsPerSecond: Number(info.instantaneous_ops_per_sec || 0),
        dbSize,
      },
      explanations: {
        memory: memoryRatio == null ? 'Redis maxmemory is not configured; showing raw memory usage only.' : thresholdExplanation('Redis memory used', Number((memoryRatio * 100).toFixed(1)), 75, 90, '% of maxmemory'),
        fallback: backend.redisTemporarilyDisabled ? `Redis is temporarily disabled until ${backend.redisDisabledUntil}.` : 'Redis is active for rate limiting and metrics.',
      },
    }
  } catch (error) {
    return {
      status: 'critical' as MetricStatus,
      backend,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function readCertificateInfo(targetUrl: string) {
  const parsed = new URL(targetUrl)
  if (parsed.protocol !== 'https:') return null

  return new Promise<{ validTo: string | null; daysRemaining: number | null }>((resolve) => {
    const socket = tls.connect({
      host: parsed.hostname,
      port: Number(parsed.port || 443),
      servername: parsed.hostname,
      rejectUnauthorized: false,
      timeout: HEALTH_TIMEOUT_MS,
    }, () => {
      const certificate = socket.getPeerCertificate()
      socket.end()
      if (!certificate?.valid_to) {
        resolve({ validTo: null, daysRemaining: null })
        return
      }
      const validTo = new Date(certificate.valid_to)
      const daysRemaining = Math.floor((validTo.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
      resolve({ validTo: validTo.toISOString(), daysRemaining })
    })

    socket.on('error', () => resolve({ validTo: null, daysRemaining: null }))
    socket.on('timeout', () => {
      socket.destroy()
      resolve({ validTo: null, daysRemaining: null })
    })
  })
}

async function probeEndpoint(name: string, url: string) {
  const startedAt = Date.now()
  try {
    const response = await withTimeout(name, () => fetch(url, { cache: 'no-store' }), HEALTH_TIMEOUT_MS * 2)
    const latencyMs = Date.now() - startedAt
    const cert = await readCertificateInfo(url)
    const endpointStatus = response.ok ? (latencyMs > 1500 ? 'warning' : 'ok') : 'critical'
    const certStatus = cert?.daysRemaining != null ? statusFor(cert.daysRemaining <= 0 ? 9999 : Math.max(0, 30 - cert.daysRemaining), 1, 15) : 'ok'
    const status = endpointStatus === 'critical' || certStatus === 'critical'
      ? 'critical'
      : endpointStatus === 'warning' || certStatus === 'warning'
        ? 'warning'
        : 'ok'

    return {
      name,
      url,
      status,
      ok: response.ok,
      statusCode: response.status,
      latencyMs,
      certificate: cert,
    }
  } catch (error) {
    return {
      name,
      url,
      status: 'critical' as MetricStatus,
      ok: false,
      statusCode: null,
      latencyMs: Date.now() - startedAt,
      certificate: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function buildEndpointSummary() {
  const siteOrigin = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || '').trim()
  const internalAppOrigin = (process.env.INTERNAL_APP_ORIGIN || `http://127.0.0.1:${process.env.PORT || '3000'}`).trim()
  const candidates = [
    siteOrigin ? { name: 'Public home', url: new URL('/', siteOrigin).toString() } : null,
    siteOrigin ? { name: 'Public health', url: new URL('/api/health', siteOrigin).toString() } : null,
    internalAppOrigin ? { name: 'Internal health', url: new URL('/api/health', internalAppOrigin).toString() } : null,
  ].filter((entry): entry is { name: string; url: string } => Boolean(entry))

  const uniqueCandidates = Array.from(new Map(candidates.map((entry) => [entry.url, entry])).values())
  const checks = await Promise.all(uniqueCandidates.map((entry) => probeEndpoint(entry.name, entry.url)))
  const status = checks.some((entry) => entry.status === 'critical')
    ? 'critical'
    : checks.some((entry) => entry.status === 'warning')
      ? 'warning'
      : 'ok'

  return { status, checks }
}

async function buildMaintenanceSummary() {
  try {
    const rows = await query<Array<Record<string, unknown>>>('SELECT task_name, status, summary, error_text, command_text, runtime_ms, UNIX_TIMESTAMP(finished_at) * 1000 as finished_at_ms FROM maintenance_runs ORDER BY finished_at DESC LIMIT 200')
    const taskGroups = new Map<string, Array<Record<string, unknown>>>()
    for (const row of rows) {
      const taskName = String(row.task_name || '')
      if (!taskGroups.has(taskName)) taskGroups.set(taskName, [])
      taskGroups.get(taskName)?.push(row)
    }

    const tasks = MAINTENANCE_TASKS.map((task) => {
      const runs = taskGroups.get(task.name) || []
      const latest = runs[0] || null
      const latestSuccess = runs.find((entry) => String(entry.status || '') !== 'failed') || null
      const ageHours = latestSuccess?.finished_at_ms ? (Date.now() - Number(latestSuccess.finished_at_ms)) / (60 * 60 * 1000) : null
      const status = !latest
        ? 'warning'
        : String(latest.status || '') === 'failed'
          ? 'critical'
          : ageHours != null && ageHours > task.expectedHours
            ? 'warning'
            : String(latest.status || '') === 'warning'
              ? 'warning'
              : 'ok'
      return {
        ...task,
        status,
        lastRunAt: latest?.finished_at_ms ? new Date(Number(latest.finished_at_ms)).toISOString() : null,
        lastSuccessAt: latestSuccess?.finished_at_ms ? new Date(Number(latestSuccess.finished_at_ms)).toISOString() : null,
        lastRunStatus: latest ? String(latest.status || 'unknown') : 'never',
        ageHours,
        runtimeMs: latest?.runtime_ms != null ? Number(latest.runtime_ms) : null,
        summary: latest?.summary ? String(latest.summary) : null,
        error: latest?.error_text ? String(latest.error_text) : null,
        command: latest?.command_text ? String(latest.command_text) : task.command,
      }
    })

    const status = tasks.some((task) => task.status === 'critical') ? 'critical' : tasks.some((task) => task.status === 'warning') ? 'warning' : 'ok'
    return { status, tasks }
  } catch (error) {
    return {
      status: 'warning' as MetricStatus,
      tasks: MAINTENANCE_TASKS.map((task) => ({
        ...task,
        status: 'warning',
        lastRunAt: null,
        lastSuccessAt: null,
        lastRunStatus: 'unknown',
        ageHours: null,
        runtimeMs: null,
        summary: null,
        error: error instanceof Error ? error.message : String(error),
        command: task.command,
      })),
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function routeStatusFor(route: { requests: number; errors: number; errorRate: number }): MetricStatus {
  if (route.requests < 5 && route.errors === 0) return 'ok'
  if (route.errorRate >= 0.2 || route.errors >= 10) return 'critical'
  if (route.errorRate >= 0.05 || route.errors >= 3) return 'warning'
  return 'ok'
}

async function buildRouteSummary() {
  const activity = await getRouteActivitySummary(12)
  const topRoutes = activity.topRoutes.map((route) => ({
    ...route,
    status: routeStatusFor(route),
    explanation: `Observed ${route.requests} requests and ${route.errors} errors in the last ${activity.bucketMinutes * activity.buckets.length} minutes.`,
  }))
  const status = topRoutes.some((route) => route.status === 'critical')
    ? 'critical'
    : topRoutes.some((route) => route.status === 'warning')
      ? 'warning'
      : 'ok'

  return {
    status,
    bucketMinutes: activity.bucketMinutes,
    buckets: activity.buckets,
    totals: activity.totals,
    topRoutes,
  }
}

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [health, abuse, storage, server, database, redis, endpoints, maintenance, routes] = await Promise.all([
    buildHealthSummary(),
    buildAbuseSummary(),
    buildStorageSummary(),
    Promise.resolve(buildServerSummary()),
    buildDatabaseSummary(),
    buildRedisSummary(),
    buildEndpointSummary(),
    buildMaintenanceSummary(),
    buildRouteSummary(),
  ])

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    health,
    abuse,
    storage,
    server,
    database,
    redis,
    endpoints,
    maintenance,
    routes,
    storagePolicy: {
      target: 'Store all non-logo images in object storage (S3/MinIO).',
      exception: 'Brand/logo assets can remain in app files when they are static build assets.',
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}