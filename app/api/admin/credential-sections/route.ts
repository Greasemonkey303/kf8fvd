import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { query } from '@/lib/db'
import { JSDOM } from 'jsdom'
import createDOMPurify from 'dompurify'
import { deleteObjectStrict, resolveObjectKeyFromReference } from '@/lib/objectStorage'
import { parseJsonObject, readNumber, readString, validationErrorResponse } from '@/lib/validation'

type DomPurifyWithConfig = ReturnType<typeof createDOMPurify> & {
  setConfig?: (config: { FORBID_TAGS: string[] }) => void
}

function slugify(s: string) {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export async function GET(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  void req
  const rows = await query('SELECT id, slug, name, subtitle, image_path, metadata, sort_order, updated_at FROM credential_sections ORDER BY sort_order ASC, updated_at DESC')
  return NextResponse.json({ items: rows || [] })
}

export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: Record<string, unknown>
  let name: string | null
  let slug: string | null
  let subtitle: string | null
  let image_path: string | null
  let sort_order: number | null
  try {
    body = await parseJsonObject(req)
    name = readString(body, 'name', { required: true, maxLength: 255 })
    slug = readString(body, 'slug', { maxLength: 255, pattern: /^[a-z0-9-_]+$/, allowEmpty: true })
    subtitle = readString(body, 'subtitle', { maxLength: 255, allowEmpty: true })
    image_path = readString(body, 'image_path', { maxLength: 1024, allowEmpty: true })
    sort_order = readNumber(body, 'sort_order', { integer: true })
  } catch (error) {
    const response = validationErrorResponse(error)
    if (response) return response
    throw error
  }
  if (!slug) slug = slugify(name)

  // uniqueness
  try {
    const exists = await query('SELECT id FROM credential_sections WHERE slug = ? LIMIT 1', [slug])
    if (Array.isArray(exists) && exists.length > 0) return NextResponse.json({ error: 'Slug already exists' }, { status: 409 })
  } catch (e) { void e }

  // sanitize subtitle
  const { window } = new JSDOM('')
  const DOMPurify = createDOMPurify(window as unknown as Window & typeof globalThis)
  const configuredPurifier = DOMPurify as DomPurifyWithConfig
  if (typeof configuredPurifier.setConfig === 'function') configuredPurifier.setConfig({ FORBID_TAGS: ['script', 'style'] })
  const safeSubtitle = subtitle ? DOMPurify.sanitize(subtitle) : null

  const res = await query('INSERT INTO credential_sections (slug, name, subtitle, image_path, sort_order) VALUES (?, ?, ?, ?, ?)', [slug, name, safeSubtitle, image_path || null, sort_order || 0])
  const id = (res as unknown as { insertId?: number })?.insertId ?? null
  return NextResponse.json({ ok: true, id })
}

export async function PUT(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: Record<string, unknown>
  let id: number | null
  let name: string | null
  let slug: string | null
  let subtitle: string | null
  let image_path: string | null
  let sort_order: number | null
  try {
    body = await parseJsonObject(req)
    id = readNumber(body, 'id', { required: true, integer: true, min: 1 })
    name = readString(body, 'name', { required: true, maxLength: 255 })
    slug = readString(body, 'slug', { maxLength: 255, pattern: /^[a-z0-9-_]+$/, allowEmpty: true })
    subtitle = readString(body, 'subtitle', { maxLength: 255, allowEmpty: true })
    image_path = readString(body, 'image_path', { maxLength: 1024, allowEmpty: true })
    sort_order = readNumber(body, 'sort_order', { integer: true })
  } catch (error) {
    const response = validationErrorResponse(error)
    if (response) return response
    throw error
  }
  if (!slug) slug = slugify(name)

  // sanitize subtitle
  const { window } = new JSDOM('')
  const DOMPurify = createDOMPurify(window as unknown as Window & typeof globalThis)
  const safeSubtitle = subtitle ? DOMPurify.sanitize(subtitle) : null

  await query('UPDATE credential_sections SET slug = ?, name = ?, subtitle = ?, image_path = ?, sort_order = ? WHERE id = ?', [slug, name, safeSubtitle, image_path || null, sort_order || 0, id])
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const rows = await query<{ image_path?: string | null }[]>('SELECT image_path FROM credential_sections WHERE id = ?', [id])
  if (!rows || rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const key = resolveObjectKeyFromReference(rows[0].image_path)
    if (key) await deleteObjectStrict(key)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
  await query('DELETE FROM credential_sections WHERE id = ?', [id])
  return NextResponse.json({ ok: true })
}
