import path from 'path'
import { pathToFileURL } from 'url'
import { afterEach, describe, expect, it, vi } from 'vitest'

async function importRoute(...segments: string[]) {
  return import(pathToFileURL(path.resolve(process.cwd(), ...segments)).href)
}

async function rejectAdminSession() {
  vi.resetModules()
  const auth = await import('../../lib/auth')
  vi.spyOn(auth, 'requireAdmin').mockResolvedValue(null)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('upload and object storage security boundaries', () => {
  it('rejects anonymous presigned PUT requests', async () => {
    await rejectAdminSession()
    const route = await importRoute('app', 'api', 'uploads', 'route.ts')
    const response = await route.POST(new Request('http://localhost/api/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'demo', filename: 'station.jpg', contentType: 'image/jpeg', size: 100 }),
    }))

    expect(response.status).toBe(401)
  })

  it('rejects anonymous presigned POST requests', async () => {
    await rejectAdminSession()
    const route = await importRoute('app', 'api', 'uploads', 'presign-post', 'route.ts')
    const response = await route.POST(new Request('http://localhost/api/uploads/presign-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'demo', filename: 'station.jpg', contentType: 'image/jpeg', size: 100 }),
    }))

    expect(response.status).toBe(401)
  })

  it.each([
    'messages/demo/private.jpg',
    'trash/project/deleted.jpg',
    'healthchecks/probe.jpg',
    'restore-drills/sample.jpg',
    '%252e%252e%252fmessages%252fprivate.jpg',
    'hero/static/active.svg',
  ])('returns not found before storage access for %s', async (key) => {
    process.env.NEXT_PUBLIC_S3_BUCKET = 'test-bucket'
    const route = await importRoute('app', 'api', 'uploads', 'get', 'route.ts')
    const response = await route.GET(
      new Request(`http://localhost/api/uploads/get/${encodeURIComponent(key)}`),
      { params: Promise.resolve({ key: [key] }) },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
  })
})
