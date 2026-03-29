import { getRedis } from './rateLimiter'
import { getMetricsPrefix, getMetricsTtlSec } from './rateLimiterConfig'
import { logRouteError } from './observability'

function metricKey(name: string) {
  return `metrics:${getMetricsPrefix()}:${name}`
}

export async function incrementAbuseMetric(name: string) {
  try {
    const redis = await getRedis()
    if (!redis || typeof redis.incr !== 'function') return false

    const key = metricKey(name)
    await redis.incr(key)
    if (typeof redis.expire === 'function') {
      await redis.expire(key, getMetricsTtlSec())
    }
    return true
  } catch (error) {
    logRouteError('lib/abuseMetrics', error, { action: 'increment_metric', resourceId: name, reason: 'redis_metric_failed' })
    return false
  }
}