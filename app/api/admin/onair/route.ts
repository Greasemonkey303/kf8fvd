import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { query } from '@/lib/db'
import { parseJsonObject, readBoolean, readString, validationErrorResponse } from '@/lib/validation'

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const rows = await query<Record<string, unknown>[]>('SELECT * FROM onair ORDER BY id ASC LIMIT 1')
    const item = Array.isArray(rows) && rows.length ? rows[0] : { id: null, is_on: 0 }
    return NextResponse.json({ item })
  } catch (err) {
    console.error('api/admin/onair GET error', err)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await parseJsonObject(req)
    const is_on = readBoolean(body, 'is_on') ? 1 : 0
    const updated_by = readString(body, 'updated_by', { maxLength: 128, allowEmpty: true })
    const note = readString(body, 'note', { maxLength: 1000, allowEmpty: true })

    const rows = await query<Record<string, unknown>[]>('SELECT id FROM onair ORDER BY id ASC LIMIT 1')
    if (Array.isArray(rows) && rows.length) {
      await query('UPDATE onair SET is_on = ?, updated_by = ?, note = ? WHERE id = ?', [is_on, updated_by, note, rows[0].id])
    } else {
      await query('INSERT INTO onair (is_on, updated_by, note) VALUES (?, ?, ?)', [is_on, updated_by, note])
    }
    const updated = await query<Record<string, unknown>[]>('SELECT * FROM onair ORDER BY id ASC LIMIT 1')
    return NextResponse.json({ item: updated && updated.length ? updated[0] : { is_on } })
  } catch (err) {
    const validationResponse = validationErrorResponse(err)
    if (validationResponse) return validationResponse
    console.error('api/admin/onair PATCH error', err)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}
