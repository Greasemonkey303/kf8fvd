import { NextResponse } from 'next/server'
import * as Minio from 'minio'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const key = url.searchParams.get('key')
    if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })

    const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
    if (!bucket) return NextResponse.json({ error: 'MinIO bucket not configured' }, { status: 500 })

    const minioClient = new Minio.Client({
      endPoint: process.env.MINIO_HOST || process.env.MINIO_ENDPOINT || process.env.AWS_S3_ENDPOINT || '127.0.0.1',
      port: Number(process.env.MINIO_PORT || process.env.MINIO_HTTP_PORT || 9000),
      useSSL: (process.env.MINIO_USE_SSL === 'true' || process.env.MINIO_USE_SSL === '1'),
      accessKey: process.env.MINIO_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
      secretKey: process.env.MINIO_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
    })

    // getObject returns a promise in the current Minio typings
    const stream: any = await minioClient.getObject(bucket, key)
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []
      stream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', (e: any) => reject(e))
    })

    // rudimentary content-type by extension
    const ext = key.split('.').pop()?.toLowerCase()
    let contentType = 'application/octet-stream'
    if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg'
    if (ext === 'png') contentType = 'image/png'
    if (ext === 'gif') contentType = 'image/gif'
    if (ext === 'webp') contentType = 'image/webp'

    return new NextResponse(new Uint8Array(buffer), { status: 200, headers: { 'Content-Type': contentType } })
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('uploads.get error', err)
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}
