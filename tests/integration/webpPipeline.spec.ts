import { Readable } from 'stream'
import path from 'path'
import { pathToFileURL } from 'url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const storageState = vi.hoisted(() => ({
  objects: new Map<string, Buffer>(),
  removed: [] as string[],
  putCalls: [] as string[],
}))

vi.mock('minio', () => {
  class Client {
    async statObject(_bucket: string, key: string) {
      if (!storageState.objects.has(key)) {
        const error = new Error(`Object not found: ${key}`) as Error & { code?: string }
        error.code = 'NotFound'
        throw error
      }
      return { size: storageState.objects.get(key)?.length || 0 }
    }

    async getObject(_bucket: string, key: string) {
      const value = storageState.objects.get(key)
      if (!value) {
        const error = new Error(`Object not found: ${key}`) as Error & { code?: string }
        error.code = 'NotFound'
        throw error
      }
      return Readable.from([value])
    }

    async putObject(_bucket: string, key: string, value: Buffer) {
      storageState.objects.set(key, Buffer.from(value))
      storageState.putCalls.push(key)
    }

    async removeObject(_bucket: string, key: string) {
      storageState.objects.delete(key)
      storageState.removed.push(key)
    }
  }

  return { Client }
})

vi.mock('sharp', () => ({
  default: (input: Buffer) => ({
    webp: () => ({
      toBuffer: async () => Buffer.from(`webp:${input.toString()}`),
    }),
  }),
}))

async function importModule(...segments: string[]) {
  const modulePath = path.resolve(process.cwd(), ...segments)
  return import(pathToFileURL(modulePath).href)
}

describe('webp upload pipeline', () => {
  beforeEach(() => {
    vi.resetModules()
    storageState.objects.clear()
    storageState.removed.length = 0
    storageState.putCalls.length = 0
    process.env.NEXT_PUBLIC_S3_BUCKET = 'test-bucket'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('generates a WebP sibling for convertible uploads', async () => {
    storageState.objects.set('projects/demo/hero.jpg', Buffer.from('original-jpg'))

    const { generateWebpVariantForObject } = await importModule('lib', 'webpVariants.ts')
    const result = await generateWebpVariantForObject('projects/demo/hero.jpg')

    expect(result).toEqual({
      originalKey: 'projects/demo/hero.jpg',
      webpKey: 'projects/demo/hero.webp',
      generated: true,
    })
    expect(storageState.putCalls).toContain('projects/demo/hero.webp')
    expect(storageState.objects.get('projects/demo/hero.webp')?.toString()).toBe('webp:original-jpg')
  })

  it('prefers the WebP sibling in the upload proxy when the browser accepts it', async () => {
    storageState.objects.set('projects/demo/hero.jpg', Buffer.from('original-jpg'))
    storageState.objects.set('projects/demo/hero.webp', Buffer.from('converted-webp'))

    const route = await importModule('app', 'api', 'uploads', 'get', 'route.ts')
    const response = await route.GET(new Request('http://localhost/api/uploads/get?key=projects%2Fdemo%2Fhero.jpg', {
      headers: { Accept: 'image/webp,image/*,*/*;q=0.8' },
    }))

    expect((response as Response).status).toBe(200)
    expect((response as Response).headers.get('content-type')).toBe('image/webp')
    expect((response as Response).headers.get('vary')).toBe('Accept')
    const body = Buffer.from(await (response as Response).arrayBuffer()).toString()
    expect(body).toBe('converted-webp')
  })

  it('deletes both the original object and its generated WebP sibling', async () => {
    storageState.objects.set('projects/demo/hero.jpg', Buffer.from('original-jpg'))
    storageState.objects.set('projects/demo/hero.webp', Buffer.from('converted-webp'))

    const objectStorage = await importModule('lib', 'objectStorage.ts')
    const result = await objectStorage.deleteObjectStrict('projects/demo/hero.jpg')

    expect(result).toEqual({
      key: 'projects/demo/hero.jpg',
      deleted: true,
      missing: false,
      webpDeleted: true,
    })
    expect(storageState.removed).toEqual(['projects/demo/hero.jpg', 'projects/demo/hero.webp'])
    expect(storageState.objects.has('projects/demo/hero.jpg')).toBe(false)
    expect(storageState.objects.has('projects/demo/hero.webp')).toBe(false)
  })
})