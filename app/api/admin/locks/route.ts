import { NextResponse } from 'next/server'
import { requireAdmin } from '../../../../lib/auth'
import { query } from '../../../../lib/db'

export async function GET(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await query('SELECT id, key_name, locked_until, reason, created_at FROM auth_locks ORDER BY created_at DESC LIMIT 500') as Array<Record<string, unknown>>
  return NextResponse.json({ items: rows || [] })
}

export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown = null
  try { body = await req.json() } catch { body = null }
  const parsed = (typeof body === 'object' && body !== null) ? (body as Record<string, unknown>) : {}
  const keyName = typeof parsed.keyName === 'string' ? parsed.keyName : null
  if (!keyName) return NextResponse.json({ error: 'Missing keyName' }, { status: 400 })

  try {
    await query('DELETE FROM auth_locks WHERE key_name = ?', [keyName])
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to unlock' }, { status: 500 })
  }
}
