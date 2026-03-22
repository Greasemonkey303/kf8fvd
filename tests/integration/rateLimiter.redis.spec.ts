import { describe, it, expect, beforeAll, afterAll } from 'vitest'

// Ensure tests do not run with production guards
(process.env as any).NODE_ENV = process.env.NODE_ENV || 'test'

let rateLimiter: typeof import('../../lib/rateLimiter') | null = null
let redisClient: { ping: () => Promise<unknown>; disconnect?: () => Promise<void> } | null = null
const KEY = 'int:rate:1'

beforeAll(async () => {
  process.env.REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379'
  try {
    const mod = await import('ioredis')
    const RedisCtor = (mod && (mod.default || mod)) as unknown as { new (url?: string): { ping: () => Promise<unknown>; disconnect: () => Promise<void> } }
    redisClient = new RedisCtor(process.env.REDIS_URL)
    await redisClient.ping()
    // Import rateLimiter after confirming Redis is reachable so getRedis uses Redis path
    rateLimiter = await import('../../lib/rateLimiter')
    await rateLimiter.resetKey(KEY)
  } catch (err: unknown) {
    // Redis not available — log and allow tests to skip
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('Redis not available for integration tests; skipping:', msg)
    redisClient = null
  }
})

afterAll(async () => {
  if (rateLimiter) await rateLimiter.resetKey(KEY)
  if (redisClient) await redisClient.disconnect?.()
})

describe('rateLimiter integration with Redis (if available)', () => {
  it('handles concurrent increments and sets a lock', async () => {
    if (!redisClient || !rateLimiter) {
      // Skip gracefully
       
      console.warn('Skipping Redis integration test (no redis)')
      return
    }

    const increments = 20
    const opts = { max: 5, windowMs: 60_000, lockMs: 10_000 }
    const promises = [] as Promise<unknown>[]
    for (let i = 0; i < increments; i++) promises.push((rateLimiter as typeof import('../../lib/rateLimiter')).incrementFailure(KEY, opts))
    const results = await Promise.all(promises)

    const anyLocked = results.some((r: any) => r && (r as any).locked)
    expect(anyLocked).toBe(true)

    const locked = await rateLimiter.isLocked(KEY)
    expect(locked).toBe(true)

    const info = await rateLimiter.getInfo(KEY)
    expect((info?.count ?? 0) >= opts.max).toBe(true)
  })
})
