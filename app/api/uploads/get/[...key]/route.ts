import { NextResponse } from 'next/server'
import * as Minio from 'minio'
import crypto from 'crypto'
import { preferWebpVariantKey } from '@/lib/webpVariants'

export async function GET(req: Request, ctx: { params?: unknown }) {
  try {
    const url = new URL(req.url)
    // accept ?key=... (preferred) or path segments /api/uploads/get/<encodedKey>
    let key = url.searchParams.get('key')

    // If no explicit `key` query param, try to extract from a `url` param
    // (this is how Next's image optimizer may call the resource: ?url=/api/uploads/get%3Fkey%3D...)
    if (!key) {
      const urlParam = url.searchParams.get('url')
      if (urlParam) {
        try {
          const decoded = decodeURIComponent(urlParam)
          let parsed: URL | null = null
          try { parsed = new URL(decoded, url.origin) } catch { parsed = null }
          if (parsed) {
            // check for ?key= inside the parsed value
            const k = parsed.searchParams.get('key')
            if (k) key = k
            else {
              const marker = '/api/uploads/get/'
              // path like /api/uploads/get/<encodedKey>
              if (parsed.pathname && parsed.pathname.includes(marker)) {
                const trailing = parsed.pathname.split(marker)[1] || ''
                try { key = decodeURIComponent(trailing) } catch { key = trailing }
              } else {
                // fallback: use pathname minus optional bucket prefix
                let p = parsed.pathname.replace(/^\//, '')
                const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
                if (bucket && p.startsWith(bucket + '/')) p = p.slice(bucket.length + 1)
                if (p) key = p
              }
            }
          } else {
            // last-resort: try decoding the raw value (may already be '%2F' encoded key)
            try { key = decodeURIComponent(urlParam) } catch { key = urlParam }
          }
        } catch {
          // ignore and continue to other fallbacks
        }
      }
    }

    // `ctx.params` can sometimes be a Promise in Next.js route handlers; unwrap if necessary
    let params = ctx && ctx.params ? ctx.params : undefined
    if (params && typeof (params as { then?: unknown }).then === 'function') {
      params = await (params as Promise<Record<string, unknown>>)
    }

    if (!key && params && Array.isArray((params as Record<string, unknown>)['key']) && ((params as Record<string, unknown>)['key'] as unknown[]).length) {
      // params.key may be an array of path segments; join and decode
      try { key = decodeURIComponent(((params as Record<string, unknown>)['key'] as unknown[]).join('/')) } catch { key = ((params as Record<string, unknown>)['key'] as unknown[]).join('/') }
    }

    if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })

    const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
    if (!bucket) return NextResponse.json({ error: 'MinIO bucket not configured' }, { status: 500 })

    // If the key still contains a leading bucket prefix, strip it
    if (key.startsWith(bucket + '/')) key = key.slice(bucket.length + 1)

    const minioClient = new Minio.Client({
      endPoint: process.env.MINIO_HOST || process.env.MINIO_ENDPOINT || process.env.AWS_S3_ENDPOINT || '127.0.0.1',
      port: Number(process.env.MINIO_PORT || process.env.MINIO_HTTP_PORT || 9000),
      useSSL: (process.env.MINIO_USE_SSL === 'true' || process.env.MINIO_USE_SSL === '1'),
      accessKey: process.env.MINIO_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
      secretKey: process.env.MINIO_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
    })

    const resolvedKey = await preferWebpVariantKey(key, req.headers.get('accept')) || key
    const rawStream = await minioClient.getObject(bucket, resolvedKey)
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []
      const s = rawStream as unknown as { on: (ev: string, cb: (...args: unknown[]) => void) => void }
      s.on('data', (c: unknown) => { try { chunks.push(Buffer.from(c as Buffer)) } catch {} })
      s.on('end', () => resolve(Buffer.concat(chunks)))
      s.on('error', (e: unknown) => reject(e))
    })

    const ext = resolvedKey.split('.').pop()?.toLowerCase()
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
      'Vary': 'Accept',
    }

    return new NextResponse(new Uint8Array(buffer), { status: 200, headers })
  } catch (err: unknown) {
    console.error('uploads.get (catch) error', err)
    let msg = 'Unknown error'
    if (err instanceof Error) msg = err.message
    else msg = String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
