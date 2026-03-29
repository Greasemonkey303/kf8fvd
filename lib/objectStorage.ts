import * as Minio from 'minio'
import { buildPublicUrl } from '@/lib/s3'
import { deriveWebpVariantKey } from '@/lib/webpVariants'

const NOT_FOUND_CODES = new Set(['NotFound', 'NoSuchKey', 'NoSuchObject'])

export function getObjectStorageBucket() {
  return process.env.NEXT_PUBLIC_S3_BUCKET || ''
}

export function createObjectStorageClient() {
  return new Minio.Client({
    endPoint: process.env.MINIO_HOST || process.env.MINIO_ENDPOINT || process.env.AWS_S3_ENDPOINT || '127.0.0.1',
    port: Number(process.env.MINIO_PORT || process.env.MINIO_HTTP_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true' || process.env.MINIO_USE_SSL === '1',
    accessKey: process.env.MINIO_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
    secretKey: process.env.MINIO_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
  })
}

function isMissingObjectError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String((error as { code?: unknown }).code || '') : ''
  const message = 'message' in error ? String((error as { message?: unknown }).message || '') : ''
  return NOT_FOUND_CODES.has(code) || /not found|no such key|no such object/i.test(message)
}

export function resolveObjectKeyFromReference(value: unknown): string | null {
  if (!value) return null

  try {
    const raw = String(value).trim()
    if (!raw) return null

    if (raw.startsWith('/api/uploads/get?')) {
      const url = new URL(raw, 'http://localhost')
      const key = url.searchParams.get('key')
      return key ? decodeURIComponent(key) : null
    }

    for (const prefix of ['/api/uploads/get/', '/uploads/get/']) {
      if (raw.startsWith(prefix)) {
        const encoded = raw.slice(prefix.length)
        return encoded ? decodeURIComponent(encoded) : null
      }
    }

    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw)
      if (url.pathname.startsWith('/api/uploads/get/')) {
        const encoded = url.pathname.slice('/api/uploads/get/'.length)
        return encoded ? decodeURIComponent(encoded) : null
      }
      const keyFromQuery = url.searchParams.get('key')
      if (keyFromQuery) return decodeURIComponent(keyFromQuery)
      let path = url.pathname.replace(/^\/+/, '')
      const bucket = getObjectStorageBucket()
      if (bucket && path.startsWith(bucket + '/')) path = path.slice(bucket.length + 1)
      return path || null
    }

    if (raw.startsWith('/')) {
      const trimmed = raw.replace(/^\/+/, '')
      if (trimmed.startsWith('api/uploads/get/')) {
        const encoded = trimmed.slice('api/uploads/get/'.length)
        return encoded ? decodeURIComponent(encoded) : null
      }
      return trimmed || null
    }

    return raw
  } catch {
    return null
  }
}

export function normalizeObjectReferenceToPublicUrl(value: unknown): string | null {
  if (value === null || value === undefined) return null

  try {
    const raw = String(value).trim()
    if (!raw) return null
    if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw

    const bucket = getObjectStorageBucket()

    if (raw.startsWith('/api/uploads/get?') || raw.startsWith('/api/uploads/get/') || raw.startsWith('/uploads/get/')) {
      const key = resolveObjectKeyFromReference(raw)
      return key ? buildPublicUrl(key) : raw
    }

    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw)
      const host = url.hostname.toLowerCase()
      const isSignedObjectUrl = url.searchParams.has('X-Amz-Algorithm') || url.searchParams.has('X-Amz-Credential')
      const isBucketPath = bucket ? url.pathname.replace(/^\/+/, '').startsWith(bucket + '/') : false
      const configuredHosts = [
        process.env.MINIO_HOST,
        process.env.MINIO_ENDPOINT,
        process.env.AWS_S3_ENDPOINT,
      ].filter((entry): entry is string => Boolean(entry)).map((entry) => entry.toLowerCase())
      const isKnownObjectHost = configuredHosts.includes(host)
      const isLocalObjectHost = host === '127.0.0.1' || host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)

      if (url.pathname.startsWith('/api/uploads/get/') || url.pathname === '/api/uploads/get' || isSignedObjectUrl || isBucketPath || isKnownObjectHost || isLocalObjectHost) {
        const key = resolveObjectKeyFromReference(raw)
        return key ? buildPublicUrl(key) : raw
      }

      return raw
    }

    if (raw.startsWith('/')) return raw

    return buildPublicUrl(raw)
  } catch {
    return typeof value === 'string' ? value : null
  }
}

export async function listObjectKeysByPrefix(prefix: string) {
  const bucket = getObjectStorageBucket()
  if (!bucket || !prefix) return []
  const client = createObjectStorageClient()
  const keys: string[] = []
  const stream = client.listObjectsV2(bucket, prefix, true)
  for await (const obj of stream) {
    if (obj && obj.name) keys.push(obj.name)
  }
  return keys
}

async function objectExists(key: string) {
  const bucket = getObjectStorageBucket()
  if (!bucket) throw new Error('Bucket not configured')
  const client = createObjectStorageClient()
  try {
    await client.statObject(bucket, key)
    return true
  } catch (error) {
    if (isMissingObjectError(error)) return false
    throw error
  }
}

export async function deleteObjectStrict(reference: unknown) {
  const key = resolveObjectKeyFromReference(reference)
  if (!key) return { key: null, deleted: false, missing: true }

  const bucket = getObjectStorageBucket()
  if (!bucket) throw new Error('Bucket not configured')

  if (!(await objectExists(key))) {
    return { key, deleted: false, missing: true }
  }

  const client = createObjectStorageClient()
  await client.removeObject(bucket, key)

  const derivedWebpKey = key.endsWith('.webp') ? null : deriveWebpVariantKey(key)
  if (derivedWebpKey && derivedWebpKey !== key && await objectExists(derivedWebpKey)) {
    await client.removeObject(bucket, derivedWebpKey)
    if (await objectExists(derivedWebpKey)) {
      throw new Error(`WebP variant still exists after delete: ${derivedWebpKey}`)
    }
  }

  if (await objectExists(key)) {
    throw new Error(`Object still exists after delete: ${key}`)
  }

  return { key, deleted: true, missing: false, webpDeleted: Boolean(derivedWebpKey) }
}

export async function deleteObjectsStrict(references: Array<unknown>) {
  const uniqueKeys = Array.from(new Set(references.map(resolveObjectKeyFromReference).filter((value): value is string => Boolean(value))))
  const results: Array<{ key: string | null; deleted: boolean; missing: boolean }> = []
  for (const key of uniqueKeys) {
    results.push(await deleteObjectStrict(key))
  }
  return results
}

export async function deletePrefixStrict(prefix: string) {
  const keys = await listObjectKeysByPrefix(prefix)
  const results = await deleteObjectsStrict(keys)
  return { keys, results }
}
