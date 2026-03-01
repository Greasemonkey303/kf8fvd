import { NextResponse } from 'next/server'
import { requireAdmin } from '../../../../lib/auth'
import { query } from '../../../../lib/db'
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
  const rows = await query(`SELECT id, slug, title, subtitle, image_path, description, external_link, is_published, sort_order, updated_at FROM projects ORDER BY sort_order ASC, updated_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`)
  const [{ total }]: any = await query('SELECT COUNT(*) as total FROM projects') as any
  return NextResponse.json({ items: rows || [], page, limit, total })
}

export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { slug, title, subtitle, image_path, description, external_link, is_published, sort_order } = body
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

  const res: any = await query('INSERT INTO projects (slug, title, subtitle, image_path, description, external_link, is_published, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [slug, title, subtitle || null, image_path || null, safeDescription, external_link || null, is_published ? 1 : 0, sort_order || 0])
  return NextResponse.json({ id: res.insertId, ok: true })
}

export async function PUT(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { id, slug, title, subtitle, image_path, description, external_link, is_published, sort_order } = body
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

  await query('UPDATE projects SET slug = ?, title = ?, subtitle = ?, image_path = ?, description = ?, external_link = ?, is_published = ?, sort_order = ? WHERE id = ?', [slug, title, subtitle || null, image_path || null, safeDescription, external_link || null, is_published ? 1 : 0, sort_order || 0, id])
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  await query('DELETE FROM projects WHERE id = ?', [id])
  return NextResponse.json({ ok: true })
}
