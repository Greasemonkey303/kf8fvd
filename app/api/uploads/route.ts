import { NextResponse } from 'next/server'
import * as Minio from 'minio'
import { getUploadKey, buildPublicUrl } from '@/lib/s3'

type ReqBody = { key?: string; contentType: string; slug?: string; filename?: string }

export async function POST(req: Request) {
  try {
    const body: ReqBody = await req.json()
    if (!body?.contentType) return NextResponse.json({ error: 'contentType required' }, { status: 400 })

    // allow server to generate a key from slug+filename, or accept a provided key
    let key = body.key
    if (!key) {
      if (!body.slug || !body.filename) return NextResponse.json({ error: 'slug and filename required when key not provided' }, { status: 400 })
      key = await getUploadKey(body.slug, body.filename)
    }

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

    // eslint-disable-next-line no-console
    console.log('uploads.presign (minio): bucket=', bucket, 'key=', key, 'contentType=', body.contentType)

    // MinIO presigned PUT
    const expires = 300
    const url = await minioClient.presignedPutObject(bucket, key, expires)

    // generate a presigned GET so clients can fetch the uploaded object
    let publicUrl: string
    try {
      const getExpires = 24 * 60 * 60
      publicUrl = await minioClient.presignedGetObject(bucket, key, getExpires)
    } catch {
      publicUrl = buildPublicUrl(key)
    }

    // parse signed url to surface signing hints in dev
    let debug: { maskedCred?: string | null; signedHeaders?: string | null } | undefined = undefined
    try {
      const u = new URL(url)
      const cred = u.searchParams.get('X-Amz-Credential')
      const signedHeaders = u.searchParams.get('X-Amz-SignedHeaders')
      if (process.env.NODE_ENV !== 'production') {
        const maskedCred = cred ? (cred.slice(0, 6) + '...' + cred.slice(-6)) : null
        debug = { maskedCred, signedHeaders }
        // eslint-disable-next-line no-console
        console.log('uploads.presign debug', debug)
      }
    } catch (_e: unknown) {
      // ignore
    }

    return NextResponse.json(Object.assign({ url, key, publicUrl }, debug ? { _debug: debug } : {}))
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error('upload presign error', err)
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
