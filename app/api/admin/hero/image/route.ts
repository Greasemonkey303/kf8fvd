import { NextResponse } from 'next/server'
import { query, transaction } from '@/lib/db'
import * as Minio from 'minio'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { hero_id, url, alt, is_featured, sort_order } = body || {}
    if (!hero_id || !url) return NextResponse.json({ error: 'hero_id and url required' }, { status: 400 })
    // insert and capture insertId if available
    const insertRes: any = await query('INSERT INTO hero_image (hero_id, url, alt, is_featured, sort_order) VALUES (?, ?, ?, ?, ?)', [hero_id, url, alt || '', is_featured ? 1 : 0, sort_order || 0])
    const insertedId = insertRes && insertRes.insertId ? insertRes.insertId : undefined

    // if is_featured set, unset others
    if (is_featured) {
      await query('UPDATE hero_image SET is_featured = 0 WHERE hero_id = ? AND url <> ?', [hero_id, url])
    }

    // Attempt to generate a WebP variant for faster delivery when possible.
    try {
      // Resolve object key from the stored URL
      let objectKey: string | undefined = undefined
      try {
        const u = new URL(String(url), 'http://localhost')
        const k = u.searchParams.get('key')
        if (k) objectKey = k
        else {
          const p = u.pathname || ''
          const pclean = p.replace(/^\//, '')
          const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
          if (bucket && pclean.startsWith(bucket + '/')) objectKey = pclean.slice(bucket.length + 1)
          else objectKey = pclean
        }
      } catch {
        objectKey = String(url)
      }

      const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
      if (bucket && objectKey) {
        const minioClient = new Minio.Client({
          endPoint: process.env.MINIO_HOST || process.env.MINIO_ENDPOINT || process.env.AWS_S3_ENDPOINT || '127.0.0.1',
          port: Number(process.env.MINIO_PORT || process.env.MINIO_HTTP_PORT || 9000),
          useSSL: (process.env.MINIO_USE_SSL === 'true' || process.env.MINIO_USE_SSL === '1'),
          accessKey: process.env.MINIO_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
          secretKey: process.env.MINIO_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
        })

        // fetch object into a buffer
        try {
          const objStream: any = await minioClient.getObject(bucket, objectKey)
          const chunks: Buffer[] = []
          if (Buffer.isBuffer(objStream)) {
            chunks.push(objStream)
          } else {
            for await (const chunk of objStream) {
              chunks.push(Buffer.from(chunk))
            }
          }
          const sourceBuffer = Buffer.concat(chunks)

          // dynamic require of sharp to avoid bundler issues if not installed
          let sharpLib: any = null
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            sharpLib = require('sharp')
          } catch (e) {
            sharpLib = null
          }

          if (sharpLib) {
            try {
              const idx = objectKey.lastIndexOf('.')
              const base = idx > -1 ? objectKey.slice(0, idx) : objectKey
              const webpKey = `${base}.webp`

              const webpBuf = await sharpLib(sourceBuffer).webp({ quality: 80 }).toBuffer()
              // upload webp variant
              await minioClient.putObject(bucket, webpKey, webpBuf)

              // ensure `variants` column exists (best-effort, avoid ALTER syntax incompatible with older MySQL)
              try {
                const info = await query<any[]>('SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', ['hero_image', 'variants'])
                const cnt = Array.isArray(info) && info.length ? Number((info[0] as any).cnt || 0) : 0
                if (!cnt) {
                  await query('ALTER TABLE hero_image ADD COLUMN variants JSON DEFAULT NULL')
                }
              } catch (e) {
                // ignore failures - schema migration may be handled separately
              }

              // update row with variants JSON
              try {
                const targetId = insertedId || (await query<any[]>('SELECT id FROM hero_image WHERE hero_id = ? AND url = ? ORDER BY created_at DESC LIMIT 1', [hero_id, url]))?.[0]?.id
                if (targetId) {
                  await query('UPDATE hero_image SET variants = ? WHERE id = ?', [JSON.stringify({ webp: webpKey }), targetId])
                }
              } catch (e) {
                // non-fatal
                // eslint-disable-next-line no-console
                console.error('failed to update hero_image variants', e)
              }
            } catch (e) {
              // conversion/upload failed, continue
              // eslint-disable-next-line no-console
              console.error('webp conversion/upload failed', e)
            }
          }
        } catch (e) {
          // fetching object failed; log and continue
          // eslint-disable-next-line no-console
          console.error('minio getObject for variant generation failed', e)
        }
      }
    } catch (e) {
      // non-blocking: log and continue
      // eslint-disable-next-line no-console
      console.error('variant generation error', e)
    }

    const rows = await query<any[]>('SELECT * FROM hero_image WHERE hero_id = ? ORDER BY is_featured DESC, sort_order ASC', [hero_id])
    return NextResponse.json({ images: rows })
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error('api/admin/hero/image POST error', err)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json()
    const { id, set_featured, sort_order, alt, url } = body || {}
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const r = await query<any[]>('SELECT * FROM hero_image WHERE id = ?', [id])
    if (!r || r.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const row = r[0]
    if (set_featured) {
      await transaction(async (conn: any) => {
        await conn.execute('UPDATE hero_image SET is_featured = 0 WHERE hero_id = ?', [row.hero_id])
        await conn.execute('UPDATE hero_image SET is_featured = 1 WHERE id = ?', [id])
      })
    }
    if (sort_order !== undefined) {
      await query('UPDATE hero_image SET sort_order = ? WHERE id = ?', [sort_order, id])
    }
    if (alt !== undefined) {
      await query('UPDATE hero_image SET alt = ? WHERE id = ?', [String(alt || ''), id])
    }
    if (url !== undefined) {
      await query('UPDATE hero_image SET url = ? WHERE id = ?', [String(url || ''), id])
    }
    const images = await query<any[]>('SELECT * FROM hero_image WHERE hero_id = ? ORDER BY is_featured DESC, sort_order ASC', [row.hero_id])
    return NextResponse.json({ images })
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error('api/admin/hero/image PATCH error', err)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const r = await query<any[]>('SELECT * FROM hero_image WHERE id = ?', [Number(id)])
    if (!r || r.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const row = r[0]
    const hero_id = row.hero_id
    const urlVal = row.url

    // attempt to delete object from S3/MinIO if possible
    try {
      let objectKey: string | undefined = undefined
      try {
        const u = new URL(String(urlVal), 'http://localhost')
        const k = u.searchParams.get('key')
        if (k) objectKey = k
        else {
          const p = u.pathname || ''
          const pclean = p.replace(/^\//, '')
          const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
          if (bucket && pclean.startsWith(bucket + '/')) objectKey = pclean.slice(bucket.length + 1)
          else objectKey = pclean
        }
      } catch {
        objectKey = String(urlVal)
      }

      if (objectKey) {
        const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
        if (bucket) {
          const minioClient = new Minio.Client({
            endPoint: process.env.MINIO_HOST || process.env.MINIO_ENDPOINT || process.env.AWS_S3_ENDPOINT || '127.0.0.1',
            port: Number(process.env.MINIO_PORT || process.env.MINIO_HTTP_PORT || 9000),
            useSSL: (process.env.MINIO_USE_SSL === 'true' || process.env.MINIO_USE_SSL === '1'),
            accessKey: process.env.MINIO_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
            secretKey: process.env.MINIO_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
          })
          try {
            // removeObjects expects an array
            await minioClient.removeObjects(bucket, [objectKey])
          } catch (e) {
            // log but do not block deletion of DB row
            // eslint-disable-next-line no-console
            console.error('minio removeObjects error', e)
          }
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('s3 delete attempt failed', e)
    }

    await query('DELETE FROM hero_image WHERE id = ?', [Number(id)])
    const images = await query<any[]>('SELECT * FROM hero_image WHERE hero_id = ? ORDER BY is_featured DESC, sort_order ASC', [hero_id])
    return NextResponse.json({ images })
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error('api/admin/hero/image DELETE error', err)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}
