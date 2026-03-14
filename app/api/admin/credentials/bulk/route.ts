import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { query } from '@/lib/db'
import * as Minio from 'minio'

const getErrMsg = (err: unknown) => {
  if (err instanceof Error) return err.message
  try { return String(err) } catch { return 'Unknown error' }
}

export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const action = body && body.action ? String(body.action) : null
  const ids = Array.isArray(body && body.ids) ? (body.ids as unknown[]).map(v => Number(v)).filter((n: number) => Number.isFinite(n) && n > 0) : []
  if (!action || ids.length === 0) return NextResponse.json({ error: 'Missing action or ids' }, { status: 400 })
  if (!['publish','unpublish','delete'].includes(action)) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  try {
    const placeholders = ids.map(() => '?').join(',')
    if (action === 'publish' || action === 'unpublish') {
      const val = action === 'publish' ? 1 : 0
      await query(`UPDATE credentials SET is_published = ? WHERE id IN (${placeholders})`, [val, ...ids])
      return NextResponse.json({ ok: true })
    }

    // delete
    if (action === 'delete') {
      const rows = await query<{ id: number; s3_prefix?: string }[]>(`SELECT id, s3_prefix FROM credentials WHERE id IN (${placeholders})`, ids)
      const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
      if (bucket) {
        const minioClient = new Minio.Client({
          endPoint: process.env.MINIO_HOST || process.env.MINIO_ENDPOINT || process.env.AWS_S3_ENDPOINT || '127.0.0.1',
          port: Number(process.env.MINIO_PORT || process.env.MINIO_HTTP_PORT || 9000),
          useSSL: (process.env.MINIO_USE_SSL === 'true' || process.env.MINIO_USE_SSL === '1'),
          accessKey: process.env.MINIO_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
          secretKey: process.env.MINIO_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
        })

        const objs: string[] = []
        for (const r of rows || []) {
          const prefix = r.s3_prefix || ''
          if (!prefix) continue
          try {
            const stream = minioClient.listObjectsV2(bucket, `${prefix}/`, true)
            for await (const obj of stream) {
              if (obj && (obj as { name?: string }).name) objs.push((obj as { name?: string }).name as string)
            }
          } catch (e: unknown) {
            // listObjects failed for this prefix; continue
          }
        }

        if (objs.length > 0) {
          // remove in chunks
          const chunkSize = 1000
          for (let i = 0; i < objs.length; i += chunkSize) {
            const chunk = objs.slice(i, i + chunkSize)
            try {
              await minioClient.removeObjects(bucket, chunk)
            } catch (e: unknown) {
              return NextResponse.json({ error: getErrMsg(e) }, { status: 500 })
            }
          }
        }
      }

      await query(`DELETE FROM credentials WHERE id IN (${placeholders})`, ids)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unhandled action' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: getErrMsg(err) }, { status: 500 })
  }
}
