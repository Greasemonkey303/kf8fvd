import { NextResponse } from 'next/server'
import * as Minio from 'minio'
import path from 'path'
import { Readable } from 'stream'
import { preferWebpVariantKey } from '@/lib/webpVariants'
import { isPublicObjectKey, normalizeObjectKey } from '@/lib/objectKeyPolicy'
import { getSafeImageContentType } from '@/lib/uploadValidation'

export function parseByteRange(value: string, size: number) {
  const match = value.match(/^bytes=(\d*)-(\d*)$/)
  if (!match || size < 1) return null

  const startText = match[1]
  const endText = match[2]
  let start: number
  let end: number

  if (!startText) {
    const suffixLength = Number(endText)
    if (!Number.isInteger(suffixLength) || suffixLength < 1) return null
    start = Math.max(0, size - suffixLength)
    end = size - 1
  } else {
    start = Number(startText)
    end = endText ? Number(endText) : size - 1
    if (!Number.isInteger(start) || !Number.isInteger(end)) return null
  }

  if (start < 0 || end < start || start >= size) return null
  end = Math.min(end, size - 1)
  return { start, end, length: end - start + 1 }
}

async function serveObject(req: Request, ctx: { params?: unknown }, headOnly: boolean) {
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

    const normalizedKey = normalizeObjectKey(key)
    if (!normalizedKey || !isPublicObjectKey(normalizedKey)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    key = normalizedKey
    if (!getSafeImageContentType(key)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const minioClient = new Minio.Client({
      endPoint: process.env.MINIO_HOST || process.env.MINIO_ENDPOINT || process.env.AWS_S3_ENDPOINT || '127.0.0.1',
      port: Number(process.env.MINIO_PORT || process.env.MINIO_HTTP_PORT || 9000),
      useSSL: (process.env.MINIO_USE_SSL === 'true' || process.env.MINIO_USE_SSL === '1'),
      accessKey: process.env.MINIO_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
      secretKey: process.env.MINIO_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
    })

    const resolvedKey = await preferWebpVariantKey(key, req.headers.get('accept')) || key
    const contentType = getSafeImageContentType(resolvedKey)
    if (!contentType) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const stat = await minioClient.statObject(bucket, resolvedKey)
    const etag = stat.etag ? `"${String(stat.etag).replace(/^"|"$/g, '')}"` : null
    const ifNone = req.headers.get('if-none-match')
    if (etag && ifNone && ifNone === etag) {
      return new NextResponse(null, { status: 304 })
    }

    const filename = path.basename(resolvedKey).replace(/["\r\n]/g, '_')
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
      'Vary': 'Accept',
    }
    if (etag) headers.ETag = etag

    const size = Number(stat.size || 0)
    const rangeHeader = req.headers.get('range')
    if (rangeHeader) {
      const range = parseByteRange(rangeHeader, size)
      if (!range) {
        headers['Content-Range'] = `bytes */${size}`
        return new NextResponse(null, { status: 416, headers })
      }
      headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`
      headers['Content-Length'] = String(range.length)
      if (headOnly) return new NextResponse(null, { status: 206, headers })

      const rangeStream = await minioClient.getPartialObject(bucket, resolvedKey, range.start, range.length)
      const rangeBody = Readable.toWeb(rangeStream) as ReadableStream<Uint8Array>
      return new NextResponse(rangeBody, { status: 206, headers })
    }

    headers['Content-Length'] = String(size)
    if (headOnly) return new NextResponse(null, { status: 200, headers })

    const rawStream = await minioClient.getObject(bucket, resolvedKey)
    const body = Readable.toWeb(rawStream) as ReadableStream<Uint8Array>
    return new NextResponse(body, { status: 200, headers })
  } catch (err: unknown) {
    if (process.env.NODE_ENV !== 'production') console.error('uploads.get (catch) error', err)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}

export function GET(req: Request, ctx: { params?: unknown }) {
  return serveObject(req, ctx, false)
}

export function HEAD(req: Request, ctx: { params?: unknown }) {
  return serveObject(req, ctx, true)
}
