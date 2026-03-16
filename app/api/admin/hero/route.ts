import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

type Body = { id?: number; title?: string; subtitle?: string; content?: string }

export async function GET(req: Request) {
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
  try {
    const body = (await req.json()) as Body
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    // Upsert: if id provided, update, else insert
    if (body.id) {
      await query('UPDATE hero SET title = ?, subtitle = ?, content = ? WHERE id = ?', [body.title || '', body.subtitle || '', body.content || '', body.id])
      const rows = await query<Record<string, unknown>[]>('SELECT * FROM hero WHERE id = ?', [body.id])
      return NextResponse.json({ item: rows[0] })
    }
    await query('INSERT INTO hero (title, subtitle, content) VALUES (?, ?, ?)', [body.title || '', body.subtitle || '', body.content || ''])
    const [newRow] = await query<Record<string, unknown>[]>('SELECT * FROM hero ORDER BY id DESC LIMIT 1')
    return NextResponse.json({ item: newRow })
  } catch (err: unknown) {
    console.error('api/admin/hero POST error', err)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  // allow partial updates: body must include id
  try {
    const body = await req.json()
    if (!body?.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const fields: string[] = []
    const params: unknown[] = []
    if (body.title !== undefined) { fields.push('title = ?'); params.push(body.title) }
    if (body.subtitle !== undefined) { fields.push('subtitle = ?'); params.push(body.subtitle) }
    if (body.content !== undefined) { fields.push('content = ?'); params.push(body.content) }
    if (fields.length === 0) return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
    params.push(body.id)
    const sql = `UPDATE hero SET ${fields.join(', ')} WHERE id = ?`
    await query(sql, params)
    const rows = await query<Record<string, unknown>[]>('SELECT * FROM hero WHERE id = ?', [body.id])
    return NextResponse.json({ item: rows[0] })
  } catch (err: unknown) {
    console.error('api/admin/hero PUT error', err)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}
