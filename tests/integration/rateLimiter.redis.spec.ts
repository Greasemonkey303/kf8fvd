import { describe, it, expect, beforeAll, afterAll } from 'vitest'

let rateLimiter: any = null
let redisClient: any = null
const KEY = 'int:rate:1'

beforeAll(async () => {
  process.env.REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379'
  try {
    const mod = await import('ioredis')
    const Redis = (mod && (mod.default || mod)) as any
    redisClient = new Redis(process.env.REDIS_URL)
    await redisClient.ping()
    // Import rateLimiter after confirming Redis is reachable so getRedis uses Redis path
    rateLimiter = await import('../../lib/rateLimiter')
    await rateLimiter.resetKey(KEY)
  } catch (err) {
    // Redis not available — log and allow tests to skip
    // eslint-disable-next-line no-console
    console.warn('Redis not available for integration tests; skipping:', err && err.message ? err.message : err)
    redisClient = null
  }
})

afterAll(async () => {
  if (rateLimiter) await rateLimiter.resetKey(KEY)
  if (redisClient) await redisClient.disconnect()
})

describe('rateLimiter integration with Redis (if available)', () => {
  it('handles concurrent increments and sets a lock', async () => {
    if (!redisClient || !rateLimiter) {
      // Skip gracefully
      // eslint-disable-next-line no-console
      console.warn('Skipping Redis integration test (no redis)')
      return
    }

    const increments = 20
    const opts = { max: 5, windowMs: 60_000, lockMs: 10_000 }
    const promises = [] as Promise<any>[]
    for (let i = 0; i < increments; i++) promises.push(rateLimiter.incrementFailure(KEY, opts))
    const results = await Promise.all(promises)

    const anyLocked = results.some(r => r && r.locked)
    expect(anyLocked).toBe(true)

    const locked = await rateLimiter.isLocked(KEY)
    expect(locked).toBe(true)

    const info = await rateLimiter.getInfo(KEY)
    expect(info && info.count >= opts.max).toBe(true)
  })
})
