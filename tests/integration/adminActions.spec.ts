import { describe, it, expect } from 'vitest'

describe('admin actions integration', () => {
  it('returns ok and actions array', async () => {
    process.env.ADMIN_API_KEY = 'test_admin_key'
    const path = await import('path')
    const { pathToFileURL } = await import('url')
    const routePath = path.resolve(process.cwd(), 'app', 'api', 'admin', 'admin-actions', 'route.ts')
    const admin = await import(pathToFileURL(routePath).href)
    const { GET } = admin
    const req = new Request('http://localhost', { headers: { 'x-admin-key': 'test_admin_key' } })
    const res = await GET(req)
    const j = await (res as Response).json()
    expect(j.ok).toBe(true)
    expect(Array.isArray(j.actions)).toBe(true)
  })
})
