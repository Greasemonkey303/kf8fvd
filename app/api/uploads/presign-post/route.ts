import { NextResponse } from 'next/server'
import * as Minio from 'minio'
import { requireAdmin } from '@/lib/auth'
import { getUploadKey, buildPublicUrl } from '@/lib/s3'
import { validateImageUploadMetadata } from '@/lib/uploadValidation'
import { isPublicObjectKey } from '@/lib/objectKeyPolicy'

type ReqBody = { slug?: string; filename?: string; contentType?: string; size?: number }

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin()
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body: ReqBody = await req.json()
    if (!body?.slug || !body?.filename || !body?.contentType || !Number.isFinite(Number(body.size))) return NextResponse.json({ error: 'slug, filename, contentType, size required' }, { status: 400 })

    const validation = validateImageUploadMetadata({ filename: body.filename, contentType: body.contentType, size: Number(body.size) })
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: validation.status })

    const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
    if (!bucket) return NextResponse.json({ error: 'MinIO bucket not configured (NEXT_PUBLIC_S3_BUCKET)' }, { status: 500 })

    const key = await getUploadKey(body.slug, body.filename)
    if (!isPublicObjectKey(key)) return NextResponse.json({ error: 'Invalid upload destination' }, { status: 400 })
    const minioClient = new Minio.Client({
      endPoint: process.env.MINIO_HOST || process.env.MINIO_ENDPOINT || process.env.AWS_S3_ENDPOINT || '127.0.0.1',
      port: Number(process.env.MINIO_PORT || process.env.MINIO_HTTP_PORT || 9000),
      useSSL: (process.env.MINIO_USE_SSL === 'true' || process.env.MINIO_USE_SSL === '1'),
      accessKey: process.env.MINIO_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
      secretKey: process.env.MINIO_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
    })

    // Build a PostPolicy for MinIO
    const policy = new Minio.PostPolicy()
    policy.setBucket(bucket)
    policy.setKey(key)
    policy.setContentType(validation.contentType)
    policy.setContentLengthRange(1, validation.maxBytes)
    policy.setExpires(new Date(Date.now() + 300 * 1000))

    const presigned = await minioClient.presignedPostPolicy(policy)

    return NextResponse.json({ url: presigned.postURL || '', fields: presigned.formData || {}, key, publicUrl: buildPublicUrl(key) })
  } catch (err: unknown) {
    console.error('presign-post error', err)
    let msg = 'Unknown error'
    if (err instanceof Error) msg = err.message
    else msg = String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
