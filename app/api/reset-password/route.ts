import { NextResponse } from 'next/server'
import { query, transaction } from '@/lib/db'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'

function sha256(input: string) { return crypto.createHash('sha256').update(input).digest('hex') }

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const token = (body?.token || '').toString()
    const password = (body?.password || '').toString()
    if (!token || !password) return NextResponse.json({ error: 'Missing token or password' }, { status: 400 })
    if (password.length < 8) return NextResponse.json({ error: 'Password too short' }, { status: 400 })

    const tokenHash = sha256(token)
    // find token row
    const rows = await query<any[]>('SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() LIMIT 1', [tokenHash])
    const trow = Array.isArray(rows) && rows.length ? rows[0] : null
    if (!trow) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })

    // update password and mark token used in a transaction
    await transaction(async (conn) => {
      const hashed = bcrypt.hashSync(password, 10)
      await conn.execute('UPDATE users SET hashed_password = ? WHERE id = ?', [hashed, trow.user_id])
      await conn.execute('UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE id = ?', [trow.id])
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
