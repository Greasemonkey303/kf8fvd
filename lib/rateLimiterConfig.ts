// Centralized runtime getters for rate limiter configuration.
export function getRateWindowMs(): number {
  return Number(process.env.RATE_WINDOW_MS ?? 15 * 60 * 1000)
}

export function getRateMax(): number {
  return Number(process.env.RATE_MAX ?? 5)
}

export function getRateLockMs(): number {
  return Number(process.env.RATE_LOCK_MS ?? 15 * 60 * 1000)
}

function buildRedisUrlFromParts(): string {
  const host = process.env.REDIS_HOST || ''
  const port = process.env.REDIS_PORT || '6379'
  const password = process.env.REDIS_PASSWORD || ''
  const username = process.env.REDIS_USERNAME || ''

  if (!host) return ''

  const auth = password || username
    ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
    : ''

  return `redis://${auth}${host}:${port}`
}

function normalizeRedisUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''

  const authMatch = trimmed.match(/^(redis(?:s)?):\/\/:([^@]*)@(.+)$/i)
  if (authMatch) {
    const [, scheme, password, rest] = authMatch
    return `${scheme}://:${encodeURIComponent(password)}@${rest}`
  }

  return trimmed
}

export function getRedisUrl(): string {
  const envRedis = buildRedisUrlFromParts() || normalizeRedisUrl(process.env.REDIS_URL || '')
  if (!envRedis && process.env.NODE_ENV === 'production') {
    throw new Error('REDIS_URL is required in production for the rate limiter; set REDIS_URL to your Redis connection string.')
  }
  return envRedis
}

export function getMetricsPrefix(): string {
  return process.env.METRICS_PREFIX || process.env.NODE_ENV || 'local'
}

export function getMetricsTtlSec(): number {
  return Number(process.env.METRICS_TTL_SEC ?? 30 * 24 * 3600)
}

const rateLimiterConfig = {
  getRateWindowMs,
  getRateMax,
  getRateLockMs,
  getRedisUrl,
  getMetricsPrefix,
  getMetricsTtlSec,
}
export default rateLimiterConfig
