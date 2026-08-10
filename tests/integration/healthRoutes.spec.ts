import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('health route disclosure boundaries', () => {
  it('returns only public liveness state', async () => {
    vi.doMock('@/lib/db', () => ({ query: vi.fn().mockResolvedValue([{ ok: 1 }]) }))
    vi.doMock('@/lib/rateLimiter', () => ({ getRedis: vi.fn().mockResolvedValue({ exists: vi.fn().mockResolvedValue(0) }) }))
    vi.doMock('@/lib/rateLimiterConfig', () => ({ getRedisUrl: vi.fn().mockReturnValue('redis://test') }))
    vi.doMock('@/lib/objectStorage', () => ({
      getObjectStorageBucket: vi.fn().mockReturnValue('test-bucket'),
      createObjectStorageClient: vi.fn().mockReturnValue({ bucketExists: vi.fn().mockResolvedValue(true) }),
    }))
    process.env.NEXTAUTH_SECRET = 'test-secret'
    process.env.CF_TURNSTILE_SECRET = 'test-turnstile-secret'
    process.env.NEXT_PUBLIC_CF_TURNSTILE_SITEKEY = 'test-site-key'
    process.env.NEXT_PUBLIC_S3_BUCKET = 'test-bucket'
    process.env.DB_HOST = 'db'
    process.env.DB_USER = 'user'
    process.env.DB_NAME = 'database'

    const route = await import('@/app/api/health/route')
    const response = await route.GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('rejects anonymous detailed health requests', async () => {
    vi.doMock('@/lib/auth', () => ({ requireAdmin: vi.fn().mockResolvedValue(null) }))
    const route = await import('@/app/api/admin/health/route')
    const response = await route.GET()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })
})
