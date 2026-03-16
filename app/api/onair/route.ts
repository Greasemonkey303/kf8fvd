import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
  try {
    // ensure table exists (idempotent)
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
    console.error('api/onair GET error', err)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  // allow clients to toggle by POSTing { is_on: 0|1 }
  try {
    const body = await req.json()
    const is_on = body && (body.is_on === 1 || body.is_on === true) ? 1 : 0

    await query(`CREATE TABLE IF NOT EXISTS onair (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      is_on TINYINT(1) NOT NULL DEFAULT 0,
      note TEXT DEFAULT NULL,
      updated_by VARCHAR(128) DEFAULT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`)

    const rows = await query<Record<string, unknown>[]>('SELECT id FROM onair ORDER BY id ASC LIMIT 1')
    if (Array.isArray(rows) && rows.length) {
      await query('UPDATE onair SET is_on = ? WHERE id = ?', [is_on, rows[0].id])
    } else {
      await query('INSERT INTO onair (is_on) VALUES (?)', [is_on])
    }
    const updated = await query<Record<string, unknown>[]>('SELECT * FROM onair ORDER BY id ASC LIMIT 1')
    return NextResponse.json({ item: updated && updated.length ? updated[0] : { is_on } })
  } catch (err) {
    console.error('api/onair POST error', err)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}
