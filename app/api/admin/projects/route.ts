import { NextResponse } from 'next/server'
import { requireAdmin } from '../../../../lib/auth'
import { query } from '../../../../lib/db'
import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'
import { archiveDeletedContent } from '@/lib/deletionArchive'
import { deleteObjectStrict, deletePrefixStrict, resolveObjectKeyFromReference } from '@/lib/objectStorage'
import { listObjectKeysByPrefix } from '@/lib/objectStorage'
import { parseJsonObject, readBoolean, readNumber, readString, readUrlString, validationErrorResponse } from '@/lib/validation'

type DomPurifyWithConfig = ReturnType<typeof createDOMPurify> & {
  setConfig?: (config: { FORBID_TAGS: string[] }) => void
}

const getErrMsg = (err: unknown) => {
  if (err instanceof Error) return err.message
  try { return String(err) } catch { return 'Unknown error' }
}

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
  const totalRows = (await query('SELECT COUNT(*) as total FROM projects')) as Array<Record<string, number>>
  const total = totalRows?.[0]?.total || 0
  return NextResponse.json({ items: rows || [], page, limit, total })
}

export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: Record<string, unknown>
  let slug: string | null
  let title: string | null
  let subtitle: string | null
  let image_path: string | null
  let description: string | null
  let external_link: string | null
  let is_published: boolean | null
  let sort_order: number | null
  try {
    body = await parseJsonObject(req)
    slug = readString(body, 'slug', { required: true, maxLength: 255, pattern: /^[a-zA-Z0-9-_]+$/ })
    title = readString(body, 'title', { required: true, maxLength: 255 })
    subtitle = readString(body, 'subtitle', { maxLength: 255, allowEmpty: true })
    image_path = readString(body, 'image_path', { maxLength: 1024, allowEmpty: true })
    description = readString(body, 'description', { allowEmpty: true })
    external_link = readUrlString(body, 'external_link', { allowRelative: true, maxLength: 2048 })
    is_published = readBoolean(body, 'is_published')
    sort_order = readNumber(body, 'sort_order', { integer: true })
  } catch (error) {
    const response = validationErrorResponse(error)
    if (response) return response
    throw error
  }

  // sanitize description server-side
  const { window } = new JSDOM('')
  const DOMPurify = createDOMPurify(window as unknown as Window & typeof globalThis)
  const configuredPurifier = DOMPurify as DomPurifyWithConfig
  if (typeof configuredPurifier.setConfig === 'function') configuredPurifier.setConfig({ FORBID_TAGS: ['script', 'style'] })
  const safeDescription = description ? DOMPurify.sanitize(String(description)) : null

  // if createDetails is requested, set external_link to /projects/<slug> and initialize metadata.details
  let metadata = null
  let finalExternal = external_link || null
  // allow initial details to be provided in the body as `details` or `metadata.details`
  const detailsInput = (() => {
    if (body && body.metadata && typeof body.metadata === 'object' && body.metadata !== null && 'details' in body.metadata) {
      return (body.metadata as Record<string, unknown>).details
    }
    return body?.details ?? ''
  })()
  if (body.createDetails) {
    finalExternal = finalExternal || `/projects/${slug}`
    // sanitize details
    const safeDetails = detailsInput ? DOMPurify.sanitize(String(detailsInput)) : ''
    metadata = JSON.stringify({ details: safeDetails })
  }

  // If metadata provided (non-create flow), ensure any details property is sanitized
  if (!metadata && body && body.metadata) {
    try {
      const metaObj = typeof body.metadata === 'string' ? JSON.parse(body.metadata) : body.metadata
      if (metaObj && typeof metaObj === 'object' && 'details' in (metaObj as Record<string, unknown>)) {
        const d = (metaObj as Record<string, unknown>).details
        ;(metaObj as Record<string, unknown>).details = DOMPurify.sanitize(String(d))
      }
      metadata = JSON.stringify(metaObj)
    } catch (e) {
      void e
      // fall back to stringified value
      try { metadata = typeof body.metadata === 'string' ? body.metadata : JSON.stringify(body.metadata) } catch (err) { void err; metadata = null }
    }
  }

  const insertRes = await query('INSERT INTO projects (slug, title, subtitle, image_path, description, external_link, metadata, is_published, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [slug, title, subtitle || null, image_path || null, safeDescription, finalExternal, metadata, is_published ? 1 : 0, sort_order || 0])
  const id = (insertRes as unknown as { insertId?: number })?.insertId ?? null
  return NextResponse.json({ id, ok: true })
}

export async function PUT(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: Record<string, unknown>
  let id: number | null
  let slug: string | null
  let title: string | null
  let subtitle: string | null
  let image_path: string | null
  let description: string | null
  let external_link: string | null
  let metadata: unknown
  let is_published: boolean | null
  let sort_order: number | null
  try {
    body = await parseJsonObject(req)
    id = readNumber(body, 'id', { required: true, integer: true, min: 1 })
    slug = readString(body, 'slug', { maxLength: 255, pattern: /^[a-zA-Z0-9-_]+$/, allowEmpty: true })
    title = readString(body, 'title', { maxLength: 255, allowEmpty: true })
    subtitle = readString(body, 'subtitle', { maxLength: 255, allowEmpty: true })
    image_path = readString(body, 'image_path', { maxLength: 1024, allowEmpty: true })
    description = readString(body, 'description', { allowEmpty: true })
    external_link = readUrlString(body, 'external_link', { allowRelative: true, maxLength: 2048 })
    metadata = body.metadata
    is_published = readBoolean(body, 'is_published')
    sort_order = readNumber(body, 'sort_order', { integer: true })
  } catch (error) {
    const response = validationErrorResponse(error)
    if (response) return response
    throw error
  }

  const { window } = new JSDOM('')
  const DOMPurify = createDOMPurify(window as unknown as Window & typeof globalThis)
  const safeDescription = description ? DOMPurify.sanitize(String(description)) : null

  // preserve metadata JSON if provided
  if (metadata !== undefined) {
    // ensure metadata is a JSON string and sanitize details if present
    let metaStr = null
    try {
      const metaObj = typeof metadata === 'string' ? JSON.parse(metadata) : metadata
      if (metaObj && typeof metaObj === 'object' && 'details' in (metaObj as Record<string, unknown>)) {
        const d = (metaObj as Record<string, unknown>).details
        ;(metaObj as Record<string, unknown>).details = DOMPurify.sanitize(String(d))
      }
      metaStr = JSON.stringify(metaObj)
    } catch (e) {
      void e
      try { metaStr = typeof metadata === 'string' ? metadata : JSON.stringify(metadata) } catch (err) { void err; metaStr = null }
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
  const rows = await query<Array<Record<string, unknown>>>('SELECT * FROM projects WHERE id = ?', [id])
  if (!rows || rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const row = rows[0]
  const slug = String(row.slug || '')
  try {
    const prefix = `${process.env.S3_UPLOAD_PREFIX || 'projects/'}${slug}/`
    const prefixKeys = await listObjectKeysByPrefix(prefix)
    const imageKey = resolveObjectKeyFromReference(row.image_path)
    await archiveDeletedContent({ contentType: 'project', originalId: Number(id), slug, snapshot: row, objectReferences: [...prefixKeys, imageKey], deletedBy: admin.email })
    await deletePrefixStrict(prefix)
    if (imageKey) await deleteObjectStrict(imageKey)
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrMsg(e) }, { status: 500 })
  }

  await query('DELETE FROM projects WHERE id = ?', [id])
  return NextResponse.json({ ok: true })
}
