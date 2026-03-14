import { NextResponse } from 'next/server'
import { query, transaction } from '@/lib/db'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { isLocked, incrementFailure } from '@/lib/rateLimiter'

function sha256(input: string) { return crypto.createHash('sha256').update(input).digest('hex') }
function sha1hex(input: string) { return crypto.createHash('sha1').update(input).digest('hex').toUpperCase() }

async function checkPwnedBySha1(sha1Upper: string) {
  const prefix = sha1Upper.slice(0,5)
  const suffix = sha1Upper.slice(5)
  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, { method: 'GET', headers: { 'Add-Padding': 'true', 'User-Agent': 'kf8fvd/1.0' } })
  if (!res.ok) return 0
  const txt = await res.text()
  const lines = txt.split('\n')
  for (const line of lines) {
    const [s, c] = line.trim().split(':')
    if (!s) continue
    if (s.toUpperCase() === suffix) return Number((c || '0').trim())
  }
  return 0
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const token = (body?.token || '').toString()
    const password = (body?.password || '').toString()
    if (!token || !password) return NextResponse.json({ error: 'Missing token or password' }, { status: 400 })
    if (password.length < 8) return NextResponse.json({ error: 'Password too short' }, { status: 400 })

    // rate-limit by token / IP
    const ip = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown').toString().split(',')[0]
    const ipKey = `ip:${ip}`
    if (await isLocked(ipKey)) return NextResponse.json({ error: 'Too many attempts, try later' }, { status: 429 })

    const tokenHash = sha256(token)
    // find token row
    const rows = await query<Record<string, unknown>[]>('SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() LIMIT 1', [tokenHash])
    const trow = Array.isArray(rows) && rows.length ? rows[0] : null
    if (!trow) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })

    // Check HaveIBeenPwned - server-side k-anonymity check
    try {
      const sha1 = sha1hex(password)
      const found = await checkPwnedBySha1(sha1)
      if (found && found > 0) {
        // record a failure for IP to discourage brute-force
        try { await incrementFailure(ipKey) } catch (_) {}
        return NextResponse.json({ error: 'This password has been seen in data breaches; choose a different password.' }, { status: 400 })
      }
    } catch (e) {
      // if HIBP check fails, don't block; log and continue
      try { console.warn('[reset-password] HIBP check failed', e) } catch (_) {}
    }

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
