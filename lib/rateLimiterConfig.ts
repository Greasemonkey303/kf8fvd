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

export function getRedisUrl(): string {
  const envRedis = process.env.REDIS_URL || (process.env.REDIS_HOST ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}` : '') || ''
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

export default {
  getRateWindowMs,
  getRateMax,
  getRateLockMs,
  getRedisUrl,
  getMetricsPrefix,
  getMetricsTtlSec,
}
