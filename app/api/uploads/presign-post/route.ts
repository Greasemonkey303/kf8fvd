import { NextResponse } from 'next/server'
import * as Minio from 'minio'
import { getUploadKey, buildPublicUrl } from '@/lib/s3'

type ReqBody = { slug?: string; filename?: string; contentType?: string }

export async function POST(req: Request) {
  try {
    const body: ReqBody = await req.json()
    if (!body?.slug || !body?.filename || !body?.contentType) return NextResponse.json({ error: 'slug, filename, contentType required' }, { status: 400 })

    const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
    if (!bucket) return NextResponse.json({ error: 'MinIO bucket not configured (NEXT_PUBLIC_S3_BUCKET)' }, { status: 500 })

    const key = await getUploadKey(body.slug, body.filename)
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
    // allow content types that start with image/
    try { policy.setContentTypeStartsWith('image/') } catch {}
    // expiry (seconds)
    try { policy.setExpires(new Date(Date.now() + 300 * 1000)) } catch {}

    const presigned = await minioClient.presignedPostPolicy(policy)

    // MinIO returns { postURL, formData }
    // generate a presigned GET URL for clients to access the object
    let publicUrl: string
    try {
      const getExpires = 24 * 60 * 60
      publicUrl = await minioClient.presignedGetObject(bucket, key, getExpires)
    } catch {
      publicUrl = buildPublicUrl(key)
    }

    return NextResponse.json({ url: presigned.postURL || '', fields: presigned.formData || {}, key, publicUrl })
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error('presign-post error', err)
    let msg = 'Unknown error'
    if (err instanceof Error) msg = err.message
    else msg = String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
