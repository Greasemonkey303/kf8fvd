import { NextResponse } from 'next/server'
import * as Minio from 'minio'
import { requireAdmin } from '@/lib/auth'
import { getUploadKey, buildPublicUrl } from '@/lib/s3'

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
    const filename = form.get('filename')?.toString() || (file && (file as File).name)
    const contentType = (file && (file as File).type) || 'application/octet-stream'

    if (!file || !filename || !slug) return NextResponse.json({ error: 'file, slug and filename required' }, { status: 400 })

    const key = await getUploadKey(slug, filename)
    const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
    if (!bucket) {
      console.error('direct upload error: missing bucket env', { bucket: process.env.NEXT_PUBLIC_S3_BUCKET })
      return NextResponse.json({ error: 'MinIO bucket not configured (NEXT_PUBLIC_S3_BUCKET)' }, { status: 500 })
    }

    const minioClient = new Minio.Client({
      endPoint: process.env.MINIO_HOST || process.env.MINIO_ENDPOINT || process.env.AWS_S3_ENDPOINT || '127.0.0.1',
      port: Number(process.env.MINIO_PORT || process.env.MINIO_HTTP_PORT || 9000),
      useSSL: (process.env.MINIO_USE_SSL === 'true' || process.env.MINIO_USE_SSL === '1'),
      accessKey: process.env.MINIO_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
      secretKey: process.env.MINIO_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
    })

    // log minimal upload attempt data (no file contents)
    console.log('direct upload attempt', { bucket, key, filename, contentType })
    const buffer = Buffer.from(await file.arrayBuffer())
    await new Promise<void>((resolve, reject) => {
      // pass buffer length and annotate callback with Error|null
      minioClient.putObject(bucket, key, buffer, buffer.length, (err?: Error | null) => {
        if (err) {
          console.error('minio.putObject error', err)
          return reject(err)
        }
        console.log('minio.putObject success', { bucket, key })
        resolve()
      })
    })

    let publicUrl: string
    try {
      const getExpires = 24 * 60 * 60
      publicUrl = await minioClient.presignedGetObject(bucket, key, getExpires)
    } catch {
      publicUrl = buildPublicUrl(key)
    }

    return NextResponse.json({ key, publicUrl })
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error('direct upload error', err)
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
