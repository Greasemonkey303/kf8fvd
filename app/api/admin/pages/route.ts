import { NextResponse } from 'next/server'
import { requireAdmin } from '../../../../lib/auth'
import { query } from '../../../../lib/db'

export async function GET(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1)
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10), 1), 100)
  const offset = (page - 1) * limit
  // Some MySQL setups don't accept prepared params for LIMIT/OFFSET; inline integers after sanitizing
  const safeLimit = Number.isFinite(limit) ? limit : 20
  const safeOffset = Number.isFinite(offset) ? offset : 0
  const rows = await query(`SELECT id, slug, title, content, is_published, updated_at FROM pages ORDER BY updated_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`)
  const [{ total }]: any = await query('SELECT COUNT(*) as total FROM pages') as any
  return NextResponse.json({ items: rows, page, limit, total })
}

export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { slug, title, content, metadata, is_published } = body
  if (!slug || !title) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  const res: any = await query('INSERT INTO pages (slug, title, content, metadata, is_published) VALUES (?, ?, ?, ?, ?)', [slug, title, content || null, metadata ? JSON.stringify(metadata) : JSON.stringify({}), is_published ? 1 : 0])
  return NextResponse.json({ id: res.insertId, ok: true })
}

export async function PUT(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { id, slug, title, content, metadata, is_published } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  await query('UPDATE pages SET slug = ?, title = ?, content = ?, metadata = ?, is_published = ? WHERE id = ?', [slug, title, content || null, metadata ? JSON.stringify(metadata) : JSON.stringify({}), is_published ? 1 : 0, id])
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  await query('DELETE FROM pages WHERE id = ?', [id])
  return NextResponse.json({ ok: true })
}
