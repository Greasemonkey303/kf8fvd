import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import * as Minio from 'minio'

export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: any = null
  try { body = await req.json() } catch (e) { body = null }
  const { key, url } = body || {}
  if (!key && !url) return NextResponse.json({ error: 'Missing key or url' }, { status: 400 })

  // resolve key from url if necessary
  let objectKey = key
  if (!objectKey && url) {
    try {
      const u = new URL(url, 'http://localhost')
      const k = u.searchParams.get('key')
      if (k) objectKey = k
      else {
        // if path starts with /, strip leading slash
        if (u.pathname) {
          const p = u.pathname.replace(/^\//, '')
          // if path begins with bucket name, remove it
          const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
          if (bucket && p.startsWith(bucket + '/')) objectKey = p.slice(bucket.length + 1)
          else objectKey = p
        }
      }
    } catch (e) {
      objectKey = url
    }
  }

  if (!objectKey) return NextResponse.json({ error: 'Unable to determine object key' }, { status: 400 })

  const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
  if (!bucket) return NextResponse.json({ error: 'Bucket not configured' }, { status: 500 })

  const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_HOST || process.env.MINIO_ENDPOINT || process.env.AWS_S3_ENDPOINT || '127.0.0.1',
    port: Number(process.env.MINIO_PORT || process.env.MINIO_HTTP_PORT || 9000),
    useSSL: (process.env.MINIO_USE_SSL === 'true' || process.env.MINIO_USE_SSL === '1'),
    accessKey: process.env.MINIO_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
    secretKey: process.env.MINIO_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
  })

  try {
    await new Promise<void>((resolve, reject) => {
      // removeObject has a callback style
      // @ts-ignore
      minioClient.removeObject(bucket, objectKey, (err: any) => {
        if (err) return reject(err)
        resolve()
      })
    })
    return NextResponse.json({ ok: true, key: objectKey })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
