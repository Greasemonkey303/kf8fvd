import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { buildPublicUrl } from '@/lib/s3'
import { generateWebpVariantForObject } from '@/lib/webpVariants'
import { parseJsonObject, readString, validationErrorResponse } from '@/lib/validation'
import { createObjectStorageClient, getObjectStorageBucket } from '@/lib/objectStorage'
import { isPublicObjectKey, normalizeObjectKey } from '@/lib/objectKeyPolicy'
import { getMaxImageUploadBytes, getSafeImageContentType, hasValidImageSignature } from '@/lib/uploadValidation'

async function streamToBuffer(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

function getMetadataContentType(metadata: Record<string, unknown> | undefined) {
  if (!metadata) return ''
  const entry = Object.entries(metadata).find(([key]) => key.toLowerCase() === 'content-type')
  return entry ? String(entry[1] || '').split(';', 1)[0].trim().toLowerCase() : ''
}

export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await parseJsonObject(req)
    const key = readString(body, 'key', { required: true, maxLength: 2048 })
    const objectKey = normalizeObjectKey(key)
    if (!objectKey || !isPublicObjectKey(objectKey)) return NextResponse.json({ error: 'Invalid object key' }, { status: 400 })

    const expectedContentType = getSafeImageContentType(objectKey)
    if (!expectedContentType) return NextResponse.json({ error: 'Unsupported image type' }, { status: 415 })

    const bucket = getObjectStorageBucket()
    if (!bucket) return NextResponse.json({ error: 'Object storage is not configured' }, { status: 500 })

    const client = createObjectStorageClient()
    const stat = await client.statObject(bucket, objectKey)
    if (!Number.isFinite(Number(stat.size)) || Number(stat.size) < 1 || Number(stat.size) > getMaxImageUploadBytes()) {
      await client.removeObject(bucket, objectKey)
      return NextResponse.json({ error: 'Stored file size is invalid' }, { status: 413 })
    }

    const metadataContentType = getMetadataContentType(stat.metaData as Record<string, unknown> | undefined)
    if (metadataContentType && metadataContentType !== expectedContentType) {
      await client.removeObject(bucket, objectKey)
      return NextResponse.json({ error: 'Stored content type is invalid' }, { status: 415 })
    }

    const signatureStream = await client.getPartialObject(bucket, objectKey, 0, 32)
    const signature = await streamToBuffer(signatureStream)
    if (!hasValidImageSignature(signature, expectedContentType)) {
      await client.removeObject(bucket, objectKey)
      return NextResponse.json({ error: 'Stored file content is invalid' }, { status: 415 })
    }

    const variant = await generateWebpVariantForObject(objectKey)
    return NextResponse.json({ ok: true, key: objectKey, publicUrl: buildPublicUrl(objectKey), variants: variant && variant.webpKey ? { webp: variant.webpKey } : null })
  } catch (error) {
    const response = validationErrorResponse(error)
    if (response) return response
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}