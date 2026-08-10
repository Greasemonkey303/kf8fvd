import path from 'path'
import { pathToFileURL } from 'url'
import { afterEach, describe, expect, it, vi } from 'vitest'

async function importRoute(...segments: string[]) {
  return import(pathToFileURL(path.resolve(process.cwd(), ...segments)).href)
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('atomic content writes', () => {
  it('upserts a page slug without a check-then-insert query', async () => {
    const auth = await import('../../lib/auth')
    const db = await import('../../lib/db')
    vi.spyOn(auth, 'requireAdmin').mockResolvedValue({ id: 1, email: 'admin@example.com' })
    const querySpy = vi.spyOn(db, 'query').mockResolvedValue({ insertId: 12, affectedRows: 2 })

    const route = await importRoute('app', 'api', 'admin', 'pages', 'route.ts')
    const response = await route.POST(new Request('http://localhost/api/admin/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'about', title: 'About', content: '<p>Updated</p>', metadata: {}, is_published: true }),
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ id: 12, ok: true, updated: true })
    expect(querySpy).toHaveBeenCalledTimes(1)
    expect(String(querySpy.mock.calls[0][0])).toContain('ON DUPLICATE KEY UPDATE')
    expect(String(querySpy.mock.calls[0][0])).not.toContain('SELECT')
  })

  it('clears and inserts a featured hero image in one transaction', async () => {
    const auth = await import('../../lib/auth')
    const db = await import('../../lib/db')
    const webp = await import('../../lib/webpVariants')
    const storage = await import('../../lib/objectStorage')
    vi.spyOn(auth, 'requireAdmin').mockResolvedValue({ id: 1, email: 'admin@example.com' })
    vi.spyOn(webp, 'generateWebpVariantForObject').mockResolvedValue({ originalKey: 'hero/1/image.jpg', webpKey: '', generated: false })
    vi.spyOn(storage, 'resolveObjectKeyFromReference').mockReturnValue(null)

    const execute = vi.fn()
      .mockResolvedValueOnce([{ affectedRows: 1 }, undefined])
      .mockResolvedValueOnce([{ insertId: 9 }, undefined])
    const transactionSpy = vi.spyOn(db, 'transaction').mockImplementation(async (callback) => callback({ execute } as never))
    vi.spyOn(db, 'query').mockResolvedValue([])

    const route = await importRoute('app', 'api', 'admin', 'hero', 'image', 'route.ts')
    const response = await route.POST(new Request('http://localhost/api/admin/hero/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hero_id: 1, url: 'hero/1/image.jpg', alt: 'Station', is_featured: true, sort_order: 0 }),
    }))

    expect(response.status).toBe(200)
    expect(transactionSpy).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0][0]).toContain('UPDATE hero_image SET is_featured = 0')
    expect(execute.mock.calls[1][0]).toContain('INSERT INTO hero_image')
  })
})
