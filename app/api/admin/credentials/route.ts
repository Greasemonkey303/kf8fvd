import { NextResponse } from 'next/server'
import { requireAdmin } from '../../../../lib/auth'
import { query } from '../../../../lib/db'
import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'
import { archiveDeletedContent } from '@/lib/deletionArchive'
import { deleteObjectStrict, deletePrefixStrict, normalizeObjectReferenceToPublicUrl, resolveObjectKeyFromReference } from '@/lib/objectStorage'
import { listObjectKeysByPrefix } from '@/lib/objectStorage'
import { parseJsonObject, readBoolean, readNumber, readString, validationErrorResponse } from '@/lib/validation'

type DomPurifyWithConfig = ReturnType<typeof createDOMPurify> & {
  setConfig?: (config: { FORBID_TAGS: string[] }) => void
}

const getErrMsg = (err: unknown) => {
  if (err instanceof Error) return err.message
  try { return String(err) } catch { return 'Unknown error' }
}

function slugify(s: string) {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
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
  const rows = await query(`SELECT id, section, slug, s3_prefix, title, tag, authority, image_path, description, metadata, is_published, sort_order, updated_at FROM credentials ORDER BY sort_order ASC, updated_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`)
  const normalizedRows = Array.isArray(rows)
    ? rows.map((row) => {
        const record = row as Record<string, unknown>
        return {
          ...record,
          image_path: normalizeObjectReferenceToPublicUrl(record.image_path),
        }
      })
    : rows
  const totalRows = (await query('SELECT COUNT(*) as total FROM credentials')) as Array<Record<string, number>>
  const total = totalRows?.[0]?.total || 0
  return NextResponse.json({ items: normalizedRows || [], page, limit, total })
}

export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: Record<string, unknown>
  let section: string | null
  let slug: string | null
  let title: string | null
  let tag: string | null
  let authority: string | null
  let image_path: string | null
  let description: string | null
  let is_published: boolean | null
  let sort_order: number | null
  try {
    body = await parseJsonObject(req)
    section = readString(body, 'section', { required: true, maxLength: 255 })
    slug = readString(body, 'slug', { required: true, maxLength: 255, pattern: /^[a-zA-Z0-9-_]+$/ })
    title = readString(body, 'title', { required: true, maxLength: 255 })
    tag = readString(body, 'tag', { maxLength: 255, allowEmpty: true })
    authority = readString(body, 'authority', { maxLength: 255, allowEmpty: true })
    image_path = readString(body, 'image_path', { maxLength: 1024, allowEmpty: true })
    description = readString(body, 'description', { allowEmpty: true })
    is_published = readBoolean(body, 'is_published')
    sort_order = readNumber(body, 'sort_order', { integer: true })
  } catch (error) {
    const response = validationErrorResponse(error)
    if (response) return response
    throw error
  }

  // ensure unique section+slug
  try {
    const exists = await query('SELECT id FROM credentials WHERE section = ? AND slug = ? LIMIT 1', [section, slug])
    if (Array.isArray(exists) && exists.length > 0) {
      return NextResponse.json({ error: 'A credential with this section and slug already exists' }, { status: 409 })
    }
  } catch (e) {
    void e // continue — uniqueness check failed
  }

  // sanitize description server-side
  const { window } = new JSDOM('')
  const DOMPurify = createDOMPurify(window as unknown as Window & typeof globalThis)
  const configuredPurifier = DOMPurify as DomPurifyWithConfig
  if (typeof configuredPurifier.setConfig === 'function') configuredPurifier.setConfig({ FORBID_TAGS: ['script', 'style'] })
  const safeDescription = description ? DOMPurify.sanitize(String(description)) : null
  const normalizedImagePath = normalizeObjectReferenceToPublicUrl(image_path)

  // compute s3 prefix for uploads (store actual folder used)
  const sectionName = section || ''
  const sectionSlug = slugify(sectionName)
  const s3Prefix = body.s3_prefix ? String(body.s3_prefix) : `credentials/${sectionSlug}/${slug}`

  let metadata = null
  if (body && body.metadata) {
    try {
      const metaObj = typeof body.metadata === 'string' ? JSON.parse(body.metadata) : body.metadata
      metadata = JSON.stringify(metaObj)
    } catch (e) {
      void e
      try { metadata = typeof body.metadata === 'string' ? body.metadata : JSON.stringify(body.metadata) } catch (err) { void err; metadata = null }
    }
  }

  const insertRes = await query('INSERT INTO credentials (section, slug, s3_prefix, title, tag, authority, image_path, description, metadata, is_published, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [section, slug, s3Prefix, title, tag || null, authority || null, normalizedImagePath || null, safeDescription, metadata, is_published ? 1 : 0, sort_order || 0])
  const id = (insertRes as unknown as { insertId?: number })?.insertId ?? null
  return NextResponse.json({ id, ok: true })
}

export async function PUT(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: Record<string, unknown>
  let id: number | null
  let section: string | null
  let slug: string | null
  let s3_prefix: string | null
  let title: string | null
  let tag: string | null
  let authority: string | null
  let image_path: string | null
  let description: string | null
  let is_published: boolean | null
  let sort_order: number | null
  let metadata: unknown
  try {
    body = await parseJsonObject(req)
    id = readNumber(body, 'id', { required: true, integer: true, min: 1 })
    section = readString(body, 'section', { maxLength: 255, allowEmpty: true })
    slug = readString(body, 'slug', { maxLength: 255, pattern: /^[a-zA-Z0-9-_]+$/, allowEmpty: true })
    s3_prefix = readString(body, 's3_prefix', { maxLength: 512, allowEmpty: true })
    title = readString(body, 'title', { maxLength: 255, allowEmpty: true })
    tag = readString(body, 'tag', { maxLength: 255, allowEmpty: true })
    authority = readString(body, 'authority', { maxLength: 255, allowEmpty: true })
    image_path = readString(body, 'image_path', { maxLength: 1024, allowEmpty: true })
    description = readString(body, 'description', { allowEmpty: true })
    is_published = readBoolean(body, 'is_published')
    sort_order = readNumber(body, 'sort_order', { integer: true })
    metadata = body.metadata
  } catch (error) {
    const response = validationErrorResponse(error)
    if (response) return response
    throw error
  }

  const { window } = new JSDOM('')
  const DOMPurify = createDOMPurify(window as unknown as Window & typeof globalThis)
  const safeDescription = description ? DOMPurify.sanitize(String(description)) : null
  const normalizedImagePath = normalizeObjectReferenceToPublicUrl(image_path)

  // allow explicit s3_prefix updates; if not provided, recompute from section+slug
  let s3PrefixFinal = s3_prefix
  try {
    if (!s3PrefixFinal) {
      const sectionSlug = section ? slugify(section) : null
      if (sectionSlug && slug) s3PrefixFinal = `credentials/${sectionSlug}/${slug}`
    }
  } catch {}

  if (metadata !== undefined) {
    let metaStr = null
    try {
      const metaObj = typeof metadata === 'string' ? JSON.parse(metadata) : metadata
      metaStr = JSON.stringify(metaObj)
    } catch (e) {
      void e
      try { metaStr = typeof metadata === 'string' ? metadata : JSON.stringify(metadata) } catch (err) { void err; metaStr = null }
    }
    await query('UPDATE credentials SET section = ?, slug = ?, s3_prefix = ?, title = ?, tag = ?, authority = ?, image_path = ?, description = ?, metadata = ?, is_published = ?, sort_order = ? WHERE id = ?', [section, slug, s3PrefixFinal || null, title, tag || null, authority || null, normalizedImagePath || null, safeDescription, metaStr, is_published ? 1 : 0, sort_order || 0, id])
  } else {
    await query('UPDATE credentials SET section = ?, slug = ?, s3_prefix = ?, title = ?, tag = ?, authority = ?, image_path = ?, description = ?, is_published = ?, sort_order = ? WHERE id = ?', [section, slug, s3PrefixFinal || null, title, tag || null, authority || null, normalizedImagePath || null, safeDescription, is_published ? 1 : 0, sort_order || 0, id])
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  // find the credential to get its s3_prefix so we can delete related objects
  const rows = await query<Array<Record<string, unknown>>>('SELECT * FROM credentials WHERE id = ?', [id])
  if (!rows || rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const row = rows[0]
  const prefix = String(row.s3_prefix || '')
  try {
    const prefixKeys = prefix ? await listObjectKeysByPrefix(`${prefix}/`) : []
    const imageKey = resolveObjectKeyFromReference(row.image_path)
    await archiveDeletedContent({ contentType: 'credential', originalId: Number(id), slug: String(row.slug || prefix || id), snapshot: row, objectReferences: [...prefixKeys, imageKey], deletedBy: admin.email })
    if (prefix) await deletePrefixStrict(`${prefix}/`)
    if (imageKey) await deleteObjectStrict(imageKey)
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrMsg(e) }, { status: 500 })
  }

  await query('DELETE FROM credentials WHERE id = ?', [id])
  return NextResponse.json({ ok: true })
}
