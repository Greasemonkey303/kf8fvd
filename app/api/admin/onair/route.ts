import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
  try {
    await query(`CREATE TABLE IF NOT EXISTS onair (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      is_on TINYINT(1) NOT NULL DEFAULT 0,
      note TEXT DEFAULT NULL,
      updated_by VARCHAR(128) DEFAULT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`)
    const rows = await query<Record<string, unknown>[]>('SELECT * FROM onair ORDER BY id ASC LIMIT 1')
    const item = Array.isArray(rows) && rows.length ? rows[0] : { id: null, is_on: 0 }
    return NextResponse.json({ item })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('api/admin/onair GET error', err)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json()
    const is_on = body && (body.is_on === 1 || body.is_on === true) ? 1 : 0
    const updated_by = body?.updated_by ? String(body.updated_by).slice(0,128) : null
    const note = body?.note ? String(body.note).slice(0,1000) : null

    await query(`CREATE TABLE IF NOT EXISTS onair (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      is_on TINYINT(1) NOT NULL DEFAULT 0,
      note TEXT DEFAULT NULL,
      updated_by VARCHAR(128) DEFAULT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`)

    const rows = await query<Record<string, unknown>[]>('SELECT id FROM onair ORDER BY id ASC LIMIT 1')
    if (Array.isArray(rows) && rows.length) {
      await query('UPDATE onair SET is_on = ?, updated_by = ?, note = ? WHERE id = ?', [is_on, updated_by, note, rows[0].id])
    } else {
      await query('INSERT INTO onair (is_on, updated_by, note) VALUES (?, ?, ?)', [is_on, updated_by, note])
    }
    const updated = await query<Record<string, unknown>[]>('SELECT * FROM onair ORDER BY id ASC LIMIT 1')
    return NextResponse.json({ item: updated && updated.length ? updated[0] : { is_on } })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('api/admin/onair PATCH error', err)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}
