import { describe, it, expect, beforeEach } from 'vitest'
import { incrementFailure, isLocked, resetKey, getInfo, __test_resetInternalState } from '../../lib/rateLimiter'

// Ensure tests do not run with production guards
process.env.NODE_ENV = process.env.NODE_ENV || 'test'

// Use a key that does NOT start with 'ip:' or 'email:' to avoid DB audit imports
const KEY = 'key:unit:1'

beforeEach(async () => {
  // ensure any cached redis client or in-memory store is cleared between tests
  try { __test_resetInternalState() } catch (e) {}
  // Force in-memory fallback for tests
  delete process.env.REDIS_URL
  delete process.env.REDIS_HOST
  await resetKey(KEY)
})

describe('rateLimiter (in-memory fallback)', () => {
  it('increments and locks after max attempts', async () => {
    const opts = { max: 3, windowMs: 60_000, lockMs: 2_000 }
    const r1 = await incrementFailure(KEY, opts)
    expect(r1.locked).toBe(false)
    expect(r1.remaining).toBe(2)

    const r2 = await incrementFailure(KEY, opts)
    expect(r2.locked).toBe(false)
    expect(r2.remaining).toBe(1)

    const r3 = await incrementFailure(KEY, opts)
    expect(r3.locked).toBe(true)
    expect(r3.remaining).toBe(0)

    const info = await getInfo(KEY)
    const locked = await isLocked(KEY)
    expect(locked || ((info?.count ?? 0) >= opts.max)).toBe(true)
    expect((info?.count ?? 0) >= 3).toBe(true)
  })

  it('resetKey clears lock and counters', async () => {
    const opts = { max: 2, windowMs: 60_000, lockMs: 2_000 }
    await incrementFailure(KEY, opts)
    await incrementFailure(KEY, opts)
    let locked = await isLocked(KEY)
    expect(locked).toBe(true)
    await resetKey(KEY)
    locked = await isLocked(KEY)
    expect(locked).toBe(false)
    const info = await getInfo(KEY)
    // getInfo may return null after reset
    expect(info === null || info === undefined).toBe(true)
  })
})
