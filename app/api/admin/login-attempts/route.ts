import { NextResponse } from 'next/server'
import { requireAdmin } from '../../../../lib/auth'
import { query } from '../../../../lib/db'

export async function GET(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100', 10), 1), 1000)
  const rows = await query('SELECT id, user_id, email, ip, success, reason, created_at FROM login_attempts ORDER BY created_at DESC LIMIT ?',[limit]) as Array<Record<string, unknown>>
  return NextResponse.json({ items: rows || [] })
}
