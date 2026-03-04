import { NextResponse } from 'next/server'
import * as Minio from 'minio'
import { requireAdmin } from '@/lib/auth'
import { getUploadKey, buildPublicUrl } from '@/lib/s3'

type Body = { slug?: string; filename?: string; contentType?: string; data?: string }

export async function POST(req: Request) {
  try {
    // allow this endpoint in development without auth for quick testing
    const isDev = process.env.NODE_ENV !== 'production'
    if (!isDev) {
      const admin = await requireAdmin()
      if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body: Body = await req.json()
    if (!body?.data || !body?.filename || !body?.slug) return NextResponse.json({ error: 'slug, filename, data required' }, { status: 400 })

    const buffer = Buffer.from(body.data, 'base64')
    const contentType = body.contentType || 'application/octet-stream'
    const key = await getUploadKey(body.slug, body.filename)

    const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
    if (!bucket) return NextResponse.json({ error: 'MinIO bucket not configured (NEXT_PUBLIC_S3_BUCKET)' }, { status: 500 })

    const minioClient = new Minio.Client({
      endPoint: process.env.MINIO_HOST || process.env.MINIO_ENDPOINT || process.env.AWS_S3_ENDPOINT || '127.0.0.1',
      port: Number(process.env.MINIO_PORT || process.env.MINIO_HTTP_PORT || 9000),
      useSSL: (process.env.MINIO_USE_SSL === 'true' || process.env.MINIO_USE_SSL === '1'),
      accessKey: process.env.MINIO_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
      secretKey: process.env.MINIO_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
    })

    await new Promise<void>((resolve, reject) => {
      // pass buffer length as the 4th argument (per Minio typings)
      minioClient.putObject(bucket, key, buffer, buffer.length, (err?: Error | null) => {
        if (err) return reject(err)
        resolve()
      })
    })

    let publicUrl: string
    try {
      const getExpires = 24 * 60 * 60
      publicUrl = await minioClient.presignedGetObject(bucket, key, getExpires)
    } catch (e) {
      publicUrl = buildPublicUrl(key)
    }

    return NextResponse.json({ key, publicUrl })
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error('direct-json upload error', err)
    let msg = 'Unknown error'
    if (err instanceof Error) msg = err.message
    else msg = String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
