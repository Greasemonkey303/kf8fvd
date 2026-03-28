import { NextResponse } from 'next/server'
import { requireAdmin } from '../../../../lib/auth'
import { query } from '../../../../lib/db'
import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'
import { deleteObjectStrict, deletePrefixStrict, normalizeObjectReferenceToPublicUrl, resolveObjectKeyFromReference } from '@/lib/objectStorage'

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
  const body = await req.json()
  const { section, slug, title, tag, authority, image_path, description, is_published, sort_order } = body
  if (!section || !slug || !title) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  if (typeof section !== 'string' || section.length === 0 || section.length > 255) return NextResponse.json({ error: 'Invalid section' }, { status: 400 })
  if (typeof slug !== 'string' || !/^[a-zA-Z0-9-_]+$/.test(slug) || slug.length > 255) return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })
  if (typeof title !== 'string' || title.length === 0 || title.length > 255) return NextResponse.json({ error: 'Invalid title' }, { status: 400 })
  if (tag && (typeof tag !== 'string' || tag.length > 255)) return NextResponse.json({ error: 'Invalid tag' }, { status: 400 })
  if (authority && (typeof authority !== 'string' || authority.length > 255)) return NextResponse.json({ error: 'Invalid authority' }, { status: 400 })
  if (image_path && image_path.length > 1024) return NextResponse.json({ error: 'Invalid image_path' }, { status: 400 })

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
  const sectionSlug = slugify(section)
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
  const body = await req.json()
  const { id, section, slug, s3_prefix, title, tag, authority, image_path, description, is_published, sort_order, metadata } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (slug && (typeof slug !== 'string' || !/^[a-zA-Z0-9-_]+$/.test(slug))) return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })
  if (title && (typeof title !== 'string' || title.length > 255)) return NextResponse.json({ error: 'Invalid title' }, { status: 400 })
  if (image_path && image_path.length > 1024) return NextResponse.json({ error: 'Invalid image_path' }, { status: 400 })

  if (section && (typeof section !== 'string' || section.length > 255)) return NextResponse.json({ error: 'Invalid section' }, { status: 400 })
  if (tag && (typeof tag !== 'string' || tag.length > 255)) return NextResponse.json({ error: 'Invalid tag' }, { status: 400 })
  if (authority && (typeof authority !== 'string' || authority.length > 255)) return NextResponse.json({ error: 'Invalid authority' }, { status: 400 })

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
  const rows = await query<{ s3_prefix: string; image_path?: string | null }[]>('SELECT s3_prefix, image_path FROM credentials WHERE id = ?', [id])
  if (!rows || rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const prefix = rows[0].s3_prefix || ''
  try {
    if (prefix) await deletePrefixStrict(`${prefix}/`)
    const imageKey = resolveObjectKeyFromReference(rows[0].image_path)
    if (imageKey) await deleteObjectStrict(imageKey)
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrMsg(e) }, { status: 500 })
  }

  await query('DELETE FROM credentials WHERE id = ?', [id])
  return NextResponse.json({ ok: true })
}
