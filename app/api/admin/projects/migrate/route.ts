import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { query } from '@/lib/db'
import * as Minio from 'minio'
import { buildPublicUrl } from '@/lib/s3'

export async function GET(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const slug = url.searchParams.get('slug')
  if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 })

  const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
  if (!bucket) return NextResponse.json({ error: 'Bucket not configured' }, { status: 500 })

  const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_HOST || process.env.MINIO_ENDPOINT || process.env.AWS_S3_ENDPOINT || '127.0.0.1',
    port: Number(process.env.MINIO_PORT || process.env.MINIO_HTTP_PORT || 9000),
    useSSL: (process.env.MINIO_USE_SSL === 'true' || process.env.MINIO_USE_SSL === '1'),
    accessKey: process.env.MINIO_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
    secretKey: process.env.MINIO_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
  })

  const prefix = `${process.env.S3_UPLOAD_PREFIX || 'projects/'}${slug}/`
  const objs: string[] = []
  try {
    const stream = minioClient.listObjectsV2(bucket, prefix, true)
    for await (const obj of stream) {
      if (obj && obj.name) objs.push(obj.name)
    }
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }

  const urls = objs.map(k => buildPublicUrl(k))
  const meta = JSON.stringify({ images: urls })
  try {
    await query('UPDATE projects SET metadata = ? WHERE slug = ?', [meta, slug])
    return NextResponse.json({ ok: true, count: urls.length, urls })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
