import { describe, it, expect } from 'vitest'

describe('admin actions CSV export', () => {
  it('returns CSV content when format=csv', async () => {
    process.env.ADMIN_API_KEY = 'test_admin_key'
    const path = await import('path')
    const { pathToFileURL } = await import('url')
    const routePath = path.resolve(process.cwd(), 'app', 'api', 'admin', 'admin-actions', 'route.ts')
    const admin = await import(pathToFileURL(routePath).href)
    const { GET } = admin
    const req = new Request('http://localhost?format=csv', { headers: { 'x-admin-key': 'test_admin_key' } })
    const res = await GET(req)
    expect(res).toBeDefined()
    const ct = res.headers.get('content-type') || ''
    expect(ct.startsWith('text/csv')).toBe(true)
    const text = await (res as Response).text()
    expect(text.split('\n').length).toBeGreaterThanOrEqual(1)
  })
})
