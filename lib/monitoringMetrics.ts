import { getRedis } from './rateLimiter'
import { getMetricsPrefix, getMetricsTtlSec } from './rateLimiterConfig'

type MetricRedisLike = {
  hincrby?: (key: string, field: string, increment: number) => Promise<number>
  hgetall?: (key: string) => Promise<Record<string, string>>
  expire?: (key: string, seconds: number) => Promise<number>
}

type TimeSeriesBucket = {
  startedAt: string
  total: number
  values: Record<string, number>
}

type RouteActivitySummary = {
  bucketMinutes: number
  buckets: TimeSeriesBucket[]
  topRoutes: Array<{
    route: string
    requests: number
    errors: number
    errorRate: number
    requestTrend: number[]
    errorTrend: number[]
  }>
  totals: {
    requests: number
    errors: number
  }
}

const MONITOR_BUCKET_MS = 5 * 60 * 1000
const MONITOR_TTL_SEC = Math.max(getMetricsTtlSec(), 8 * 24 * 60 * 60)

function bucketStart(timestamp = Date.now()) {
  return Math.floor(timestamp / MONITOR_BUCKET_MS) * MONITOR_BUCKET_MS
}

function seriesKey(series: 'requests' | 'errors', startedAtMs: number) {
  return `metrics:${getMetricsPrefix()}:monitor:${series}:${startedAtMs}`
}

function normalizeSegment(segment: string) {
  if (!segment) return segment
  if (/^\d+$/.test(segment)) return '[id]'
  if (/^[0-9a-f]{8,}$/i.test(segment)) return '[id]'
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return '[id]'
  if (segment.length >= 24 && /[0-9]/.test(segment)) return '[id]'
  return segment
}

export function normalizeMonitoredPath(input: string | null | undefined) {
  const raw = String(input || '').trim()
  if (!raw) return '/unknown'

  const pathOnly = raw.split('?')[0] || raw
  const normalized = pathOnly
    .split('/')
    .filter(Boolean)
    .map(normalizeSegment)
    .join('/')

  return `/${normalized}`.replace(/\/+/g, '/')
}

async function incrementSeriesField(series: 'requests' | 'errors', route: string, amount = 1) {
  try {
    const redis = (await getRedis()) as MetricRedisLike | null
    if (!redis?.hincrby) return false

    const key = seriesKey(series, bucketStart())
    await redis.hincrby(key, route, amount)
    if (redis.expire) await redis.expire(key, MONITOR_TTL_SEC)
    return true
  } catch {
    return false
  }
}

export async function recordObservedRequest(pathname: string) {
  return incrementSeriesField('requests', normalizeMonitoredPath(pathname))
}

export async function recordObservedError(route: string | null | undefined) {
  return incrementSeriesField('errors', normalizeMonitoredPath(route))
}

async function readSeries(series: 'requests' | 'errors', bucketCount: number): Promise<TimeSeriesBucket[]> {
  const redis = (await getRedis()) as MetricRedisLike | null
  const now = bucketStart()
  const starts = Array.from({ length: bucketCount }, (_, index) => now - ((bucketCount - index - 1) * MONITOR_BUCKET_MS))

  if (!redis?.hgetall) {
    return starts.map((startedAtMs) => ({
      startedAt: new Date(startedAtMs).toISOString(),
      total: 0,
      values: {},
    }))
  }

  const buckets: TimeSeriesBucket[] = []
  for (const startedAtMs of starts) {
    const key = seriesKey(series, startedAtMs)
    const rawValues = await redis.hgetall(key)
    const pairs = Object.entries(rawValues || {}).reduce<Array<[string, number]>>((acc, [route, value]) => {
      const numericValue = Number(value || 0)
      if (Number.isFinite(numericValue) && numericValue > 0) acc.push([route, numericValue])
      return acc
    }, [])
    const values = Object.fromEntries(pairs)
    const total = Object.values(values).reduce((sum, value) => sum + value, 0)
    buckets.push({ startedAt: new Date(startedAtMs).toISOString(), total, values })
  }

  return buckets
}

export async function getRouteActivitySummary(bucketCount = 12): Promise<RouteActivitySummary> {
  const [requestBuckets, errorBuckets] = await Promise.all([
    readSeries('requests', bucketCount),
    readSeries('errors', bucketCount),
  ])

  const requestTotals = new Map<string, number>()
  const errorTotals = new Map<string, number>()

  for (const bucket of requestBuckets) {
    for (const [route, value] of Object.entries(bucket.values)) {
      requestTotals.set(route, (requestTotals.get(route) || 0) + value)
    }
  }

  for (const bucket of errorBuckets) {
    for (const [route, value] of Object.entries(bucket.values)) {
      errorTotals.set(route, (errorTotals.get(route) || 0) + value)
    }
  }

  const routeNames = Array.from(new Set([...requestTotals.keys(), ...errorTotals.keys()]))
  const topRoutes = routeNames
    .map((route) => {
      const requests = requestTotals.get(route) || 0
      const errors = errorTotals.get(route) || 0
      const requestTrend = requestBuckets.map((bucket) => bucket.values[route] || 0)
      const errorTrend = errorBuckets.map((bucket) => bucket.values[route] || 0)
      return {
        route,
        requests,
        errors,
        errorRate: requests > 0 ? errors / requests : 0,
        requestTrend,
        errorTrend,
      }
    })
    .sort((a, b) => {
      if (b.requests !== a.requests) return b.requests - a.requests
      if (b.errors !== a.errors) return b.errors - a.errors
      return a.route.localeCompare(b.route)
    })
    .slice(0, 8)

  return {
    bucketMinutes: Math.round(MONITOR_BUCKET_MS / 60000),
    buckets: requestBuckets.map((bucket, index) => ({
      startedAt: bucket.startedAt,
      total: bucket.total,
      values: {
        requests: bucket.total,
        errors: errorBuckets[index]?.total || 0,
      },
    })),
    topRoutes,
    totals: {
      requests: requestBuckets.reduce((sum, bucket) => sum + bucket.total, 0),
      errors: errorBuckets.reduce((sum, bucket) => sum + bucket.total, 0),
    },
  }
}