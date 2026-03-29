import path from 'path'
import { pathToFileURL } from 'url'
import { afterEach, describe, expect, it, vi } from 'vitest'

async function importRoute(...segments: string[]) {
  const routePath = path.resolve(process.cwd(), ...segments)
  return import(pathToFileURL(routePath).href)
}

async function setupCommonSpies() {
  vi.resetModules()

  const auth = await import('../../lib/auth')
  const db = await import('../../lib/db')
  const deletionArchive = await import('../../lib/deletionArchive')
  const objectStorage = await import('../../lib/objectStorage')

  vi.spyOn(auth, 'requireAdmin').mockResolvedValue({ id: 1, email: 'admin@example.com' })

  return {
    querySpy: vi.spyOn(db, 'query'),
    archiveDeletedContentSpy: vi.spyOn(deletionArchive, 'archiveDeletedContent'),
    deletePrefixStrictSpy: vi.spyOn(objectStorage, 'deletePrefixStrict'),
    deleteObjectStrictSpy: vi.spyOn(objectStorage, 'deleteObjectStrict'),
    deleteObjectsStrictSpy: vi.spyOn(objectStorage, 'deleteObjectsStrict'),
    listObjectKeysByPrefixSpy: vi.spyOn(objectStorage, 'listObjectKeysByPrefix'),
    resolveObjectKeySpy: vi.spyOn(objectStorage, 'resolveObjectKeyFromReference'),
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('destructive flow handlers', () => {
  it('deletes a project row and its related object storage keys', async () => {
    const { querySpy, archiveDeletedContentSpy, deletePrefixStrictSpy, deleteObjectStrictSpy, listObjectKeysByPrefixSpy, resolveObjectKeySpy } = await setupCommonSpies()

    querySpy.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT * FROM projects')) {
        return [{ slug: 'demo-project', image_path: '/api/uploads/get/projects%2Fdemo-project%2Fhero.jpg' }]
      }
      if (sql.includes('DELETE FROM projects')) return { affectedRows: 1 }
      throw new Error(`Unexpected query: ${sql}`)
    })
    archiveDeletedContentSpy.mockResolvedValue({ originalObjectKeys: ['projects/demo-project/hero.jpg'], archivedObjectKeys: ['trash/project/demo-project/projects/demo-project/hero.jpg'] })
    deletePrefixStrictSpy.mockResolvedValue({ keys: ['projects/demo-project/hero.jpg'], results: [] })
    resolveObjectKeySpy.mockReturnValue('projects/demo-project/hero.jpg')
    listObjectKeysByPrefixSpy.mockResolvedValue(['projects/demo-project/hero.jpg'])
    deleteObjectStrictSpy.mockResolvedValue({ key: 'projects/demo-project/hero.jpg', deleted: true, missing: false })

    const route = await importRoute('app', 'api', 'admin', 'projects', 'route.ts')
    const res = await route.DELETE(new Request('http://localhost/api/admin/projects?id=42'))
    const body = await (res as Response).json()

    expect((res as Response).status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(deletePrefixStrictSpy).toHaveBeenCalledWith('projects/demo-project/')
    expect(deleteObjectStrictSpy).toHaveBeenCalledWith('projects/demo-project/hero.jpg')
    expect(querySpy).toHaveBeenLastCalledWith('DELETE FROM projects WHERE id = ?', ['42'])
  }, 30000)

  it('does not delete the project row when storage cleanup fails', async () => {
    const { querySpy, archiveDeletedContentSpy, deletePrefixStrictSpy, listObjectKeysByPrefixSpy } = await setupCommonSpies()

    querySpy.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT * FROM projects')) {
        return [{ slug: 'demo-project', image_path: null }]
      }
      if (sql.includes('DELETE FROM projects')) return { affectedRows: 1 }
      throw new Error(`Unexpected query: ${sql}`)
    })
    archiveDeletedContentSpy.mockResolvedValue({ originalObjectKeys: [], archivedObjectKeys: [] })
    listObjectKeysByPrefixSpy.mockResolvedValue([])
    deletePrefixStrictSpy.mockRejectedValue(new Error('minio delete failed'))

    const route = await importRoute('app', 'api', 'admin', 'projects', 'route.ts')
    const res = await route.DELETE(new Request('http://localhost/api/admin/projects?id=42'))
    const body = await (res as Response).json()

    expect((res as Response).status).toBe(500)
    expect(body).toEqual({ error: 'minio delete failed' })
    expect(querySpy).not.toHaveBeenCalledWith('DELETE FROM projects WHERE id = ?', ['42'])
  }, 30000)

  it('deletes a credential row and its object storage references', async () => {
    const { querySpy, archiveDeletedContentSpy, deletePrefixStrictSpy, deleteObjectStrictSpy, listObjectKeysByPrefixSpy, resolveObjectKeySpy } = await setupCommonSpies()

    querySpy.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT * FROM credentials')) {
        return [{ s3_prefix: 'credentials/licenses/station-license', image_path: 'credentials/licenses/station-license/license.jpg' }]
      }
      if (sql.includes('DELETE FROM credentials')) return { affectedRows: 1 }
      throw new Error(`Unexpected query: ${sql}`)
    })
    archiveDeletedContentSpy.mockResolvedValue({ originalObjectKeys: ['credentials/licenses/station-license/license.jpg'], archivedObjectKeys: ['trash/credential/station-license/credentials/licenses/station-license/license.jpg'] })
    deletePrefixStrictSpy.mockResolvedValue({ keys: ['credentials/licenses/station-license/license.jpg'], results: [] })
    listObjectKeysByPrefixSpy.mockResolvedValue(['credentials/licenses/station-license/license.jpg'])
    resolveObjectKeySpy.mockReturnValue('credentials/licenses/station-license/license.jpg')
    deleteObjectStrictSpy.mockResolvedValue({ key: 'credentials/licenses/station-license/license.jpg', deleted: true, missing: false })

    const route = await importRoute('app', 'api', 'admin', 'credentials', 'route.ts')
    const res = await route.DELETE(new Request('http://localhost/api/admin/credentials?id=8'))
    const body = await (res as Response).json()

    expect((res as Response).status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(deletePrefixStrictSpy).toHaveBeenCalledWith('credentials/licenses/station-license/')
    expect(deleteObjectStrictSpy).toHaveBeenCalledWith('credentials/licenses/station-license/license.jpg')
  }, 30000)

  it('deletes a page row and its page prefix', async () => {
    const { querySpy, archiveDeletedContentSpy, deletePrefixStrictSpy, listObjectKeysByPrefixSpy } = await setupCommonSpies()

    querySpy.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT * FROM pages')) return [{ id: 12, slug: 'about-me', title: 'About me', metadata: '{}' }]
      if (sql.includes('DELETE FROM pages')) return { affectedRows: 1 }
      throw new Error(`Unexpected query: ${sql}`)
    })
    archiveDeletedContentSpy.mockResolvedValue({ originalObjectKeys: ['pages/about-me/hero.jpg'], archivedObjectKeys: ['trash/page/about-me/pages/about-me/hero.jpg'] })
    deletePrefixStrictSpy.mockResolvedValue({ keys: ['pages/about-me/hero.jpg'], results: [] })
    listObjectKeysByPrefixSpy.mockResolvedValue(['pages/about-me/hero.jpg'])

    const route = await importRoute('app', 'api', 'admin', 'pages', 'route.ts')
    const res = await route.DELETE(new Request('http://localhost/api/admin/pages?id=12'))
    const body = await (res as Response).json()

    expect((res as Response).status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(deletePrefixStrictSpy).toHaveBeenCalledWith('pages/about-me/')
    expect(querySpy).toHaveBeenLastCalledWith('DELETE FROM pages WHERE id = ?', ['12'])
  }, 30000)

  it('deletes a hero image row plus original and variant objects', async () => {
    const { querySpy, archiveDeletedContentSpy, deleteObjectStrictSpy, resolveObjectKeySpy } = await setupCommonSpies()

    querySpy.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT * FROM hero_image WHERE id = ?')) {
        return [{ id: 9, hero_id: 1, url: '/api/uploads/get/hero%2F1%2Foriginal.jpg', variants: JSON.stringify({ webp: 'hero/1/original.webp', mobile: 'hero/1/original-mobile.webp' }) }]
      }
      if (sql.includes('DELETE FROM hero_image WHERE id = ?')) return { affectedRows: 1 }
      if (sql.includes('SELECT * FROM hero_image WHERE hero_id = ?')) return [{ id: 10, hero_id: 1, url: 'hero/1/next.jpg' }]
      throw new Error(`Unexpected query: ${sql}`)
    })
    archiveDeletedContentSpy.mockResolvedValue({ originalObjectKeys: ['hero/1/original.jpg', 'hero/1/original.webp', 'hero/1/original-mobile.webp'], archivedObjectKeys: ['trash/hero_image/1/hero/1/original.jpg'] })
    resolveObjectKeySpy.mockReturnValue('hero/1/original.jpg')
    deleteObjectStrictSpy.mockResolvedValue({ key: 'hero/1/original.jpg', deleted: true, missing: false })

    const route = await importRoute('app', 'api', 'admin', 'hero', 'image', 'route.ts')
    const res = await route.DELETE(new Request('http://localhost/api/admin/hero/image?id=9'))
    const body = await (res as Response).json()

    expect((res as Response).status).toBe(200)
    expect(Array.isArray(body.images)).toBe(true)
    expect(deleteObjectStrictSpy).toHaveBeenCalledWith('hero/1/original.jpg')
    expect(deleteObjectStrictSpy).toHaveBeenCalledWith('hero/1/original.webp')
    expect(deleteObjectStrictSpy).toHaveBeenCalledWith('hero/1/original-mobile.webp')
  }, 30000)

  it('deletes an uploaded object consistently when given a proxied URL', async () => {
    const { archiveDeletedContentSpy, deleteObjectStrictSpy } = await setupCommonSpies()

    archiveDeletedContentSpy.mockResolvedValue({ originalObjectKeys: ['messages/demo/file.pdf'], archivedObjectKeys: ['trash/upload_object/messages-demo-file.pdf/messages/demo/file.pdf'] })
    deleteObjectStrictSpy.mockResolvedValue({ key: 'messages/demo/file.pdf', deleted: true, missing: false })

    const route = await importRoute('app', 'api', 'uploads', 'delete', 'route.ts')
    const req = new Request('http://localhost/api/uploads/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://localhost/api/uploads/get?key=messages%2Fdemo%2Ffile.pdf' }),
    })
    const res = await route.POST(req)
    const body = await (res as Response).json()

    expect((res as Response).status).toBe(200)
    expect(body).toEqual({ ok: true, key: 'messages/demo/file.pdf', deleted: true, missing: false })
    expect(deleteObjectStrictSpy).toHaveBeenCalledWith('messages/demo/file.pdf')
  }, 30000)
})