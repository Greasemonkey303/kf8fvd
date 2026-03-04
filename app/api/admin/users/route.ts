import { NextResponse } from 'next/server'
import { requireAdmin } from '../../../../lib/auth'
import { query } from '../../../../lib/db'
import bcrypt from 'bcryptjs'

export async function GET(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1)
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10), 1), 100)
  const offset = (page - 1) * limit
  const safeLimit = Number.isFinite(limit) ? limit : 20
  const safeOffset = Number.isFinite(offset) ? offset : 0
  const rows = await query<{ id: number; name: string; email: string; is_active: number; created_at: string; roles?: string | null }[]>(`SELECT u.id, u.name, u.email, u.is_active, u.created_at, GROUP_CONCAT(r.name) as roles FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id GROUP BY u.id ORDER BY u.created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`)
  const countRows = await query<{ total: number }[]>('SELECT COUNT(*) as total FROM users')
  const total = countRows?.[0]?.total ?? 0
  // normalize roles into arrays
  const items = (rows || []).map(r => ({ ...r, roles: r.roles ? String(r.roles).split(',') : [] }))
  return NextResponse.json({ items, page, limit, total })
}

export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { name, email, password, roles } = body
  if (!email || !password) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  const hashed = bcrypt.hashSync(password, 12)
  const insertRes = await query('INSERT INTO users (name, email, hashed_password, is_active) VALUES (?, ?, ?, 1)', [name || null, email, hashed])
  const userId = (insertRes as unknown as { insertId?: number })?.insertId ?? null
  // assign roles if provided
  if (Array.isArray(roles)) {
    for (const roleName of roles) {
      const roleRows = await query<{ id: number }[]>('SELECT id FROM roles WHERE name = ? LIMIT 1', [roleName])
      const rid = roleRows && roleRows.length ? roleRows[0].id : null
      if (rid) await query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, rid])
    }
  }
  return NextResponse.json({ id: userId, ok: true })
}

export async function PUT(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { id, name, email, password, is_active, roles } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (password) {
    const hashed = bcrypt.hashSync(password, 12)
    await query('UPDATE users SET name=?, email=?, hashed_password=?, is_active=? WHERE id=?', [name || null, email, hashed, is_active ? 1 : 0, id])
  } else {
    await query('UPDATE users SET name=?, email=?, is_active=? WHERE id=?', [name || null, email, is_active ? 1 : 0, id])
  }
  if (Array.isArray(roles)) {
    await query('DELETE FROM user_roles WHERE user_id = ?', [id])
    for (const roleName of roles) {
      const roleRows = await query<{ id: number }[]>('SELECT id FROM roles WHERE name = ? LIMIT 1', [roleName])
      const rid = roleRows && roleRows.length ? roleRows[0].id : null
      if (rid) await query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [id, rid])
    }
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  await query('DELETE FROM users WHERE id = ?', [id])
  return NextResponse.json({ ok: true })
}
