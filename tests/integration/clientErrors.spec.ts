import path from 'path'
import { pathToFileURL } from 'url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function importRoute() {
  const routePath = path.resolve(process.cwd(), 'app', 'api', 'client-errors', 'route.ts')
  return import(pathToFileURL(routePath).href)
}

describe('client error intake hardening', () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.REDIS_URL
    process.env.CLIENT_ERROR_MAX_BYTES = '256'
    process.env.CLIENT_ERROR_RATE_WINDOW_MS = '60000'
    process.env.CLIENT_ERROR_RATE_LOCK_MS = '60000'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.CLIENT_ERROR_MAX_BYTES
    delete process.env.CLIENT_ERROR_RATE_WINDOW_MS
    delete process.env.CLIENT_ERROR_RATE_LOCK_MS
    delete process.env.CLIENT_ERROR_RATE_MAX
  })

  it('rejects oversized payloads', async () => {
    const route = await importRoute()
    const hugeMessage = 'x'.repeat(600)
    const req = new Request('http://localhost/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(hugeMessage.length + 100) },
      body: JSON.stringify({ type: 'window-error', message: hugeMessage }),
    })

    const res = await route.POST(req)
    expect((res as Response).status).toBe(413)
  })

  it('rejects oversized payloads without relying on content-length', async () => {
    const route = await importRoute()
    const req = new Request('http://localhost/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'window-error', message: 'x'.repeat(600) }),
    })

    const res = await route.POST(req)
    expect((res as Response).status).toBe(413)
  })

  it('dedupes repeated reports within the dedupe window', async () => {
    const route = await importRoute()
    const headers = { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.10' }
    const body = JSON.stringify({ type: 'window-error', message: 'boom', route: '/admin' })

    const first = await route.POST(new Request('http://localhost/api/client-errors', { method: 'POST', headers, body }))
    const second = await route.POST(new Request('http://localhost/api/client-errors', { method: 'POST', headers, body }))

    expect((first as Response).status).toBe(202)
    expect((second as Response).status).toBe(202)
    expect(await (second as Response).json()).toEqual({ ok: true, deduped: true })
  })

  it('rate limits repeated client error posts from the same source', async () => {
    process.env.CLIENT_ERROR_RATE_MAX = '1'
    const route = await importRoute()
    const headers = { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.5' }

    const first = await route.POST(new Request('http://localhost/api/client-errors', {
      method: 'POST',
      headers,
      body: JSON.stringify({ type: 'window-error', message: 'first failure', route: '/one' }),
    }))

    const second = await route.POST(new Request('http://localhost/api/client-errors', {
      method: 'POST',
      headers,
      body: JSON.stringify({ type: 'fetch-error', message: 'second failure', route: '/two' }),
    }))

    expect((first as Response).status).toBe(202)
    expect((second as Response).status).toBe(429)
  })
})