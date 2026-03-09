import { NextResponse } from 'next/server'
import * as Minio from 'minio'
import crypto from 'crypto'

export async function GET(req: Request, ctx: any) {
  try {
    const url = new URL(req.url)
    // accept ?key=... or path segments /api/uploads/get/<encodedKey>
    let key = url.searchParams.get('key')

    // `ctx.params` can sometimes be a Promise in Next.js route handlers; unwrap if necessary
    let params = ctx && ctx.params ? ctx.params : undefined
    if (params && typeof (params as any).then === 'function') {
      params = await params
    }

    if (!key && params && Array.isArray(params.key) && params.key.length) {
      // params.key may be an array of path segments; join and decode
      try { key = decodeURIComponent(params.key.join('/')) } catch { key = params.key.join('/') }
    }
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

    const rawStream = await minioClient.getObject(bucket, key)
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []
      const s = rawStream as unknown as { on: (ev: string, cb: (...args: unknown[]) => void) => void }
      s.on('data', (c: unknown) => { try { chunks.push(Buffer.from(c as Buffer)) } catch {} })
      s.on('end', () => resolve(Buffer.concat(chunks)))
      s.on('error', (e: unknown) => reject(e))
    })

    const ext = key.split('.').pop()?.toLowerCase()
    let contentType = 'application/octet-stream'
    if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg'
    else if (ext === 'png') contentType = 'image/png'
    else if (ext === 'gif') contentType = 'image/gif'
    else if (ext === 'webp') contentType = 'image/webp'
    else if (ext === 'avif') contentType = 'image/avif'
    else if (ext === 'svg') contentType = 'image/svg+xml'

    // ETag for caching
    const etag = crypto.createHash('sha1').update(buffer).digest('hex')
    const ifNone = req.headers.get('if-none-match')
    if (ifNone && ifNone === etag) {
      return new NextResponse(null, { status: 304 })
    }

    const headers = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'ETag': etag,
    }

    return new NextResponse(new Uint8Array(buffer), { status: 200, headers })
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error('uploads.get (catch) error', err)
    let msg = 'Unknown error'
    if (err instanceof Error) msg = err.message
    else msg = String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
