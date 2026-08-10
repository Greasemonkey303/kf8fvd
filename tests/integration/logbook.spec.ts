import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  vi.unstubAllGlobals()
  delete process.env.LOGBOOK_PROVIDER
  delete process.env.LOGBOOK_URL
  delete process.env.LOGBOOK_ALLOWED_ORIGINS
  delete process.env.LOGBOOK_API_KEY
})

async function setup(queryResult: unknown[] = []) {
  vi.doMock('@/lib/db', () => ({ query: vi.fn().mockResolvedValue(queryResult) }))
  vi.doMock('@/lib/rateLimiter', () => ({
    isLocked: vi.fn().mockResolvedValue(false),
    incrementFailure: vi.fn().mockResolvedValue({ locked: false, remaining: 29 }),
  }))
  vi.doMock('@/lib/observability', () => ({ logRouteError: vi.fn(), logRouteEvent: vi.fn() }))
  return import('@/app/api/logbook/route')
}

describe('logbook route', () => {
  it('returns normalized database entries and ignores diagnostic query parameters', async () => {
    const route = await setup([{ call: 'kf8fvd', date: '20260809', time: '120000', band: '2m', mode: 'FM' }])
    const response = await route.GET(new Request('http://localhost/api/logbook?diag=1', { headers: { 'x-forwarded-for': '203.0.113.1' } }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.source).toBe('db')
    expect(body.entries[0]).toMatchObject({ call: 'KF8FVD', band: '2m', mode: 'FM' })
    expect(body).not.toHaveProperty('env')
    expect(body).not.toHaveProperty('debug')
    expect(body).not.toHaveProperty('raw')
  })

  it('returns an honest empty state instead of mock contacts', async () => {
    const route = await setup([])
    const response = await route.GET(new Request('http://localhost/api/logbook'))

    await expect(response.json()).resolves.toEqual({ source: 'unavailable', entries: [], updatedAt: null })
  })

  it('does not fetch a custom provider outside the HTTPS allowlist', async () => {
    process.env.LOGBOOK_PROVIDER = 'custom'
    process.env.LOGBOOK_URL = 'http://127.0.0.1/private'
    process.env.LOGBOOK_ALLOWED_ORIGINS = 'https://logs.example.com'
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const route = await setup([])
    const response = await route.GET(new Request('http://localhost/api/logbook'))

    expect(response.status).toBe(200)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect((await response.json()).source).toBe('unavailable')
  })
})
