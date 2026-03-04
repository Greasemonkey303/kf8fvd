import { NextResponse } from 'next/server'
import { requireAdmin } from '../../../../lib/auth'
import { query } from '../../../../lib/db'
import * as Minio from 'minio'
import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'

export async function GET(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1)
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1), 500)
  const offset = (page - 1) * limit
  const safeLimit = Number.isFinite(limit) ? limit : 50
  const safeOffset = Number.isFinite(offset) ? offset : 0
  const rows = await query(`SELECT id, slug, title, subtitle, image_path, description, external_link, metadata, is_published, sort_order, updated_at FROM projects ORDER BY sort_order ASC, updated_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`)
  const [{ total }]: any = await query('SELECT COUNT(*) as total FROM projects') as any
  return NextResponse.json({ items: rows || [], page, limit, total })
}

export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { slug, title, subtitle, image_path, description, external_link, is_published, sort_order, createDetails } = body
  // basic validation
  if (!slug || !title) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  if (typeof slug !== 'string' || !/^[a-zA-Z0-9-_]+$/.test(slug)) return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })
  if (typeof title !== 'string' || title.length > 255) return NextResponse.json({ error: 'Invalid title' }, { status: 400 })
  if (image_path && image_path.length > 1024) return NextResponse.json({ error: 'Invalid image_path' }, { status: 400 })
  if (external_link) {
    try { new URL(external_link, 'http://example.com') } catch (e) { return NextResponse.json({ error: 'Invalid external_link' }, { status: 400 }) }
  }

  // sanitize description server-side
  const window = (new JSDOM('')).window as any
  const DOMPurify = createDOMPurify(window)
  const safeDescription = description ? DOMPurify.sanitize(String(description)) : null

  // if createDetails is requested, set external_link to /projects/<slug> and initialize metadata.details
  let metadata = null
  let finalExternal = external_link || null
  // allow initial details to be provided in the body as `details` or `metadata.details`
  const detailsInput = (body && body.metadata && body.metadata.details) || body.details || ''
  if (createDetails) {
    finalExternal = finalExternal || `/projects/${slug}`
    // sanitize details
    const safeDetails = detailsInput ? DOMPurify.sanitize(String(detailsInput)) : ''
    metadata = JSON.stringify({ details: safeDetails })
  }

  // If metadata provided (non-create flow), ensure any details property is sanitized
  if (!metadata && body && body.metadata) {
    try {
      const metaObj = typeof body.metadata === 'string' ? JSON.parse(body.metadata) : body.metadata
      if (metaObj && metaObj.details) metaObj.details = DOMPurify.sanitize(String(metaObj.details))
      metadata = JSON.stringify(metaObj)
    } catch (e) {
      // fall back to stringified value
      try { metadata = typeof body.metadata === 'string' ? body.metadata : JSON.stringify(body.metadata) } catch (e) { metadata = null }
    }
  }

  const res: any = await query('INSERT INTO projects (slug, title, subtitle, image_path, description, external_link, metadata, is_published, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [slug, title, subtitle || null, image_path || null, safeDescription, finalExternal, metadata, is_published ? 1 : 0, sort_order || 0])
  return NextResponse.json({ id: res.insertId, ok: true })
}

export async function PUT(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { id, slug, title, subtitle, image_path, description, external_link, is_published, sort_order, metadata } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  // basic validation
  if (slug && (typeof slug !== 'string' || !/^[a-zA-Z0-9-_]+$/.test(slug))) return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })
  if (title && (typeof title !== 'string' || title.length > 255)) return NextResponse.json({ error: 'Invalid title' }, { status: 400 })
  if (image_path && image_path.length > 1024) return NextResponse.json({ error: 'Invalid image_path' }, { status: 400 })
  if (external_link) {
    try { new URL(external_link, 'http://example.com') } catch (e) { return NextResponse.json({ error: 'Invalid external_link' }, { status: 400 }) }
  }

  const window = (new JSDOM('')).window as any
  const DOMPurify = createDOMPurify(window)
  const safeDescription = description ? DOMPurify.sanitize(String(description)) : null

  // preserve metadata JSON if provided
  if (metadata !== undefined) {
    // ensure metadata is a JSON string and sanitize details if present
    let metaStr = null
    try {
      const metaObj = typeof metadata === 'string' ? JSON.parse(metadata) : metadata
      if (metaObj && metaObj.details) metaObj.details = DOMPurify.sanitize(String(metaObj.details))
      metaStr = JSON.stringify(metaObj)
    } catch (e) {
      try { metaStr = typeof metadata === 'string' ? metadata : JSON.stringify(metadata) } catch (e) { metaStr = null }
    }
    await query('UPDATE projects SET slug = ?, title = ?, subtitle = ?, image_path = ?, description = ?, external_link = ?, metadata = ?, is_published = ?, sort_order = ? WHERE id = ?', [slug, title, subtitle || null, image_path || null, safeDescription, external_link || null, metaStr, is_published ? 1 : 0, sort_order || 0, id])
  } else {
    await query('UPDATE projects SET slug = ?, title = ?, subtitle = ?, image_path = ?, description = ?, external_link = ?, is_published = ?, sort_order = ? WHERE id = ?', [slug, title, subtitle || null, image_path || null, safeDescription, external_link || null, is_published ? 1 : 0, sort_order || 0, id])
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  // find the project to get its slug so we can delete related objects
  const rows: any = await query('SELECT slug FROM projects WHERE id = ?', [id])
  if (!rows || rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const slug = rows[0].slug

  const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
  if (bucket) {
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

    if (objs.length > 0) {
      try {
        await minioClient.removeObjects(bucket, objs)
      } catch (e: any) {
        return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
      }
    }
  }

  await query('DELETE FROM projects WHERE id = ?', [id])
  return NextResponse.json({ ok: true })
}
