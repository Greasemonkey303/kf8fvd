import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { query } from '@/lib/db'
import { assertAtLeastOneField, parseJsonObject, readNumber, readString, validationErrorResponse } from '@/lib/validation'

type Body = { id?: number; title?: string; subtitle?: string; content?: string }

export async function GET(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (id) {
      const rows = await query<Record<string, unknown>[]>('SELECT * FROM hero WHERE id = ?', [Number(id)])
      return NextResponse.json({ items: rows })
    }
    const rows = await query<Record<string, unknown>[]>('SELECT * FROM hero ORDER BY id ASC')
    return NextResponse.json({ items: rows })
  } catch (err: unknown) {
    console.error('api/admin/hero GET error', err)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await parseJsonObject(req) as Body & Record<string, unknown>
    const id = readNumber(body, 'id', { integer: true, min: 1 })
    const title = readString(body, 'title', { maxLength: 255, allowEmpty: true })
    const subtitle = readString(body, 'subtitle', { maxLength: 255, allowEmpty: true })
    const content = readString(body, 'content', { allowEmpty: true })
    // Upsert: if id provided, update, else insert
    if (id) {
      await query('UPDATE hero SET title = ?, subtitle = ?, content = ? WHERE id = ?', [title || '', subtitle || '', content || '', id])
      const rows = await query<Record<string, unknown>[]>('SELECT * FROM hero WHERE id = ?', [id])
      return NextResponse.json({ item: rows[0] })
    }
    await query('INSERT INTO hero (title, subtitle, content) VALUES (?, ?, ?)', [title || '', subtitle || '', content || ''])
    const [newRow] = await query<Record<string, unknown>[]>('SELECT * FROM hero ORDER BY id DESC LIMIT 1')
    return NextResponse.json({ item: newRow })
  } catch (err: unknown) {
    const validationResponse = validationErrorResponse(err)
    if (validationResponse) return validationResponse
    console.error('api/admin/hero POST error', err)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // allow partial updates: body must include id
  try {
    const body = await parseJsonObject(req)
    const id = readNumber(body, 'id', { required: true, integer: true, min: 1 })
    assertAtLeastOneField(body, ['title', 'subtitle', 'content'])
    const fields: string[] = []
    const params: unknown[] = []
    if (body.title !== undefined) { fields.push('title = ?'); params.push(body.title) }
    if (body.subtitle !== undefined) { fields.push('subtitle = ?'); params.push(body.subtitle) }
    if (body.content !== undefined) { fields.push('content = ?'); params.push(body.content) }
    params.push(id)
    const sql = `UPDATE hero SET ${fields.join(', ')} WHERE id = ?`
    await query(sql, params)
    const rows = await query<Record<string, unknown>[]>('SELECT * FROM hero WHERE id = ?', [id])
    return NextResponse.json({ item: rows[0] })
  } catch (err: unknown) {
    const validationResponse = validationErrorResponse(err)
    if (validationResponse) return validationResponse
    console.error('api/admin/hero PUT error', err)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}
