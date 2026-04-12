import { createObjectStorageClient, getObjectStorageBucket, resolveObjectKeyFromReference } from './objectStorage'

const CONVERTIBLE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif'])

function getExtension(key: string) {
  return key.split('.').pop()?.toLowerCase() || ''
}

export function deriveWebpVariantKey(reference: unknown) {
  const key = resolveObjectKeyFromReference(reference)
  if (!key) return null
  const ext = getExtension(key)
  if (!CONVERTIBLE_EXTENSIONS.has(ext)) return null
  return key.replace(/\.[^.]+$/, '.webp')
}

async function objectExists(key: string) {
  const bucket = getObjectStorageBucket()
  if (!bucket) return false
  const client = createObjectStorageClient()
  try {
    await client.statObject(bucket, key)
    return true
  } catch {
    return false
  }
}

async function streamToBuffer(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

export async function generateWebpVariantForObject(reference: unknown) {
  const bucket = getObjectStorageBucket()
  const key = resolveObjectKeyFromReference(reference)
  const webpKey = deriveWebpVariantKey(key)
  if (!bucket || !key || !webpKey) return null

  if (await objectExists(webpKey)) {
    return { originalKey: key, webpKey, generated: false }
  }

  const mod = await import('sharp')
  const sharpLib = (mod && (mod.default || mod)) as unknown as (input: Buffer) => { webp: (opts?: { quality?: number }) => { toBuffer: () => Promise<Buffer> } }
  const client = createObjectStorageClient()
  const objectStream = await client.getObject(bucket, key)
  const sourceBuffer = await streamToBuffer(objectStream)
  const webpBuffer = await sharpLib(sourceBuffer).webp({ quality: 80 }).toBuffer()
  await client.putObject(bucket, webpKey, webpBuffer, webpBuffer.length, { 'Content-Type': 'image/webp' })
  return { originalKey: key, webpKey, generated: true }
}

export async function preferWebpVariantKey(reference: unknown, acceptHeader?: string | null) {
  const key = resolveObjectKeyFromReference(reference)
  if (!key) return null
  if (!String(acceptHeader || '').toLowerCase().includes('image/webp')) return key

  const webpKey = deriveWebpVariantKey(key)
  if (!webpKey) return key
  if (await objectExists(webpKey)) return webpKey

  try {
    const generated = await generateWebpVariantForObject(key)
    if (generated?.webpKey) return generated.webpKey
  } catch {
    return key
  }

  return key
}