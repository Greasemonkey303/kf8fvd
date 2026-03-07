import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { query } from '@/lib/db'
import { JSDOM } from 'jsdom'
import createDOMPurify from 'dompurify'

function slugify(s: string) {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export async function GET(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rows = await query('SELECT id, slug, name, subtitle, image_path, metadata, sort_order, updated_at FROM credential_sections ORDER BY sort_order ASC, updated_at DESC')
  return NextResponse.json({ items: rows || [] })
}

export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const name = body && body.name ? String(body.name).trim() : ''
  let slug = body && body.slug ? String(body.slug).trim() : ''
  const subtitle = body && body.subtitle ? String(body.subtitle).trim() : null
  const image_path = body && body.image_path ? String(body.image_path) : null
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 })
  if (!slug) slug = slugify(name)
  if (!/^[a-z0-9-_]+$/.test(slug)) return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })

  // uniqueness
  try {
    const exists = await query('SELECT id FROM credential_sections WHERE slug = ? LIMIT 1', [slug])
    if (Array.isArray(exists) && exists.length > 0) return NextResponse.json({ error: 'Slug already exists' }, { status: 409 })
  } catch (e) { }

  // sanitize subtitle
  const { window } = new JSDOM('')
  const DOMPurify = createDOMPurify(window as unknown as Window & typeof globalThis)
  const safeSubtitle = subtitle ? DOMPurify.sanitize(subtitle) : null

  const res = await query('INSERT INTO credential_sections (slug, name, subtitle, image_path, sort_order) VALUES (?, ?, ?, ?, ?)', [slug, name, safeSubtitle, image_path || null, body.sort_order || 0])
  const id = (res as any)?.insertId ?? null
  return NextResponse.json({ ok: true, id })
}

export async function PUT(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const name = body && body.name ? String(body.name).trim() : ''
  let slug = body && body.slug ? String(body.slug).trim() : ''
  const subtitle = body && body.subtitle ? String(body.subtitle).trim() : null
  const image_path = body && body.image_path ? String(body.image_path) : null
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 })
  if (!slug) slug = slugify(name)
  if (!/^[a-z0-9-_]+$/.test(slug)) return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })

  // sanitize subtitle
  const { window } = new JSDOM('')
  const DOMPurify = createDOMPurify(window as unknown as Window & typeof globalThis)
  const safeSubtitle = subtitle ? DOMPurify.sanitize(subtitle) : null

  await query('UPDATE credential_sections SET slug = ?, name = ?, subtitle = ?, image_path = ?, sort_order = ? WHERE id = ?', [slug, name, safeSubtitle, image_path || null, body.sort_order || 0, id])
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  await query('DELETE FROM credential_sections WHERE id = ?', [id])
  return NextResponse.json({ ok: true })
}
