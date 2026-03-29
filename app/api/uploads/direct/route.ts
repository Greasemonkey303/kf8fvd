import { NextResponse } from 'next/server'
import * as Minio from 'minio'
import { requireAdmin } from '@/lib/auth'
import { getUploadKey, buildPublicUrl } from '@/lib/s3'
import { generateWebpVariantForObject } from '@/lib/webpVariants'
import { logRouteError, logRouteEvent } from '@/lib/observability'

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin()
    if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const form = await req.formData()
    const fileEntry = form.get('file')
    function isFile(v: FormDataEntryValue | null | undefined): v is File {
      return typeof v === 'object' && v !== null && 'arrayBuffer' in v
    }
    if (!isFile(fileEntry)) return NextResponse.json({ error: 'file, slug and filename required' }, { status: 400 })
    const file = fileEntry
    const slug = form.get('slug')?.toString() || form.get('folder')?.toString()
    // optional prefix override (e.g. 'credentials/' or 'credentials/sections/')
    const prefixOverride = form.get('prefix')?.toString() || form.get('prefixOverride')?.toString() || undefined
    const filename = form.get('filename')?.toString() || (file && (file as File).name)
    const contentType = (file && (file as File).type) || 'application/octet-stream'

    if (!file || !filename || !slug) return NextResponse.json({ error: 'file, slug and filename required' }, { status: 400 })

    const key = await getUploadKey(slug, filename, prefixOverride)
    const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
    if (!bucket) {
      logRouteEvent('error', { route: 'api/uploads/direct', action: 'direct_upload_failed', actor: admin.email, resourceId: key, reason: 'missing_bucket_env' })
      return NextResponse.json({ error: 'MinIO bucket not configured (NEXT_PUBLIC_S3_BUCKET)' }, { status: 500 })
    }

    const minioClient = new Minio.Client({
      endPoint: process.env.MINIO_HOST || process.env.MINIO_ENDPOINT || process.env.AWS_S3_ENDPOINT || '127.0.0.1',
      port: Number(process.env.MINIO_PORT || process.env.MINIO_HTTP_PORT || 9000),
      useSSL: (process.env.MINIO_USE_SSL === 'true' || process.env.MINIO_USE_SSL === '1'),
      accessKey: process.env.MINIO_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
      secretKey: process.env.MINIO_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
    })

    if (process.env.NODE_ENV !== 'production') {
      logRouteEvent('debug', { route: 'api/uploads/direct', action: 'direct_upload_attempt', actor: admin.email, resourceId: key, bucket, filename, contentType })
    }
    const buffer = Buffer.from(await file.arrayBuffer())
    await new Promise<void>((resolve, reject) => {
      // pass buffer length and annotate callback with Error|null
      minioClient.putObject(bucket, key, buffer, buffer.length, (err?: Error | null) => {
        if (err) {
          logRouteError('api/uploads/direct', err, { action: 'direct_upload_put_object', actor: admin.email, resourceId: key, reason: 'minio_put_failed' })
          return reject(err)
        }
        if (process.env.NODE_ENV !== 'production') {
          logRouteEvent('debug', { route: 'api/uploads/direct', action: 'direct_upload_success_debug', actor: admin.email, resourceId: key, bucket })
        }
        resolve()
      })
    })

    const publicUrl = buildPublicUrl(key)
    const variant = await generateWebpVariantForObject(key).catch(() => null)

    logRouteEvent('info', { route: 'api/uploads/direct', action: 'direct_upload_success', actor: admin.email, resourceId: key, bucket })
    return NextResponse.json({ key, publicUrl, variants: variant && variant.webpKey ? { webp: variant.webpKey } : null })
  } catch (err: unknown) {
    logRouteError('api/uploads/direct', err, { action: 'direct_upload_failed', reason: 'route_exception' })
    let msg = 'Unknown error'
    const payload: Record<string, unknown> = {}
    if (err instanceof Error) {
      msg = err.message
      if (process.env.NODE_ENV !== 'production') payload.stack = err.stack || ''
    } else {
      msg = String(err)
    }
    payload.error = msg
    return NextResponse.json(payload, { status: 500 })
  }
}
