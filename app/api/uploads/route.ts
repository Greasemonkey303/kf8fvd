import { NextResponse } from 'next/server'
import * as Minio from 'minio'
import { requireAdmin } from '@/lib/auth'
import { getUploadKey, buildPublicUrl } from '@/lib/s3'
import { logRouteError, logRouteEvent } from '@/lib/observability'
import { validateImageUploadMetadata } from '@/lib/uploadValidation'
import { isPublicObjectKey } from '@/lib/objectKeyPolicy'

type ReqBody = { key?: string; contentType?: string; slug?: string; filename?: string; size?: number; prefix?: string; prefixOverride?: string }

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin()
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body: ReqBody = await req.json()

    // Allow client to omit contentType; infer from key/filename when possible
    let contentTypeRaw = body?.contentType ? String(body.contentType).trim().toLowerCase() : ''
    if (!contentTypeRaw) {
      const maybe = String(body?.key || body?.filename || '')
      const ext = maybe.split('.').pop()?.toLowerCase() || ''
      const map: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
        avif: 'image/avif',
        svg: 'image/svg+xml',
        ico: 'image/x-icon'
      }
      if (ext && map[ext]) contentTypeRaw = map[ext]
    }

    if (!contentTypeRaw) return NextResponse.json({ error: 'contentType required or could not be inferred from filename' }, { status: 400 })

    const providedSize = Number(body.size)
    if (!Number.isFinite(providedSize)) return NextResponse.json({ error: 'File size required' }, { status: 400 })
    const filename = String(body.filename || body.key || '')
    const validation = validateImageUploadMetadata({ filename, contentType: contentTypeRaw, size: providedSize })
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: validation.status })

    // allow server to generate a key from slug+filename, or accept a provided key
    let key = body.key
    if (!key) {
      if (!body.slug || !body.filename) return NextResponse.json({ error: 'slug and filename required when key not provided' }, { status: 400 })
      // allow caller to request a specific prefix (e.g. credentials/)
      const prefixOverride = body.prefix || body.prefixOverride || undefined
      key = await getUploadKey(body.slug, body.filename, prefixOverride)
    }
    if (!isPublicObjectKey(key)) return NextResponse.json({ error: 'Invalid upload destination' }, { status: 400 })

    const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
    if (!bucket) {
      return NextResponse.json({ error: 'MinIO bucket not configured (NEXT_PUBLIC_S3_BUCKET)' }, { status: 500 })
    }

    // Build MinIO client from env (fall back to AWS env names if present)
    const minioClient = new Minio.Client({
      endPoint: process.env.MINIO_HOST || process.env.MINIO_ENDPOINT || process.env.AWS_S3_ENDPOINT || '127.0.0.1',
      port: Number(process.env.MINIO_PORT || process.env.MINIO_HTTP_PORT || 9000),
      useSSL: (process.env.MINIO_USE_SSL === 'true' || process.env.MINIO_USE_SSL === '1'),
      accessKey: process.env.MINIO_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
      secretKey: process.env.MINIO_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
    })

    if (process.env.NODE_ENV !== 'production') {
      logRouteEvent('debug', { route: 'api/uploads', action: 'presign_requested', actor: admin.email, resourceId: key, bucket, contentType: validation.contentType })
    }

    // MinIO presigned PUT
    const expires = 300
    const url = await minioClient.presignedPutObject(bucket, key, expires)

    // For long-term public access prefer the proxied app URL (stable key) instead of a signed GET
    const publicUrl = buildPublicUrl(key)

    logRouteEvent('info', { route: 'api/uploads', action: 'presign_created', actor: admin.email, resourceId: key, bucket })
    return NextResponse.json({ url, key, publicUrl })
  } catch (err: unknown) {
    logRouteError('api/uploads', err, { action: 'presign_failed', reason: 'minio_presign_failed' })
    let msg = 'Unknown error'
    if (typeof err === 'object' && err !== null) {
      const maybe = (err as { message?: unknown }).message
      if (typeof maybe === 'string') msg = maybe
      else msg = String(err)
    } else {
      msg = String(err)
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
