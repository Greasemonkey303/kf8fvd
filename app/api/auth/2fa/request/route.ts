import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { isLocked, incrementFailure, resetKey } from '@/lib/rateLimiter'

async function verifyTurnstileToken(token?: string) {
  const bypass = (process.env.CF_TURNSTILE_BYPASS || '').toLowerCase()
  if (bypass === '1' || bypass === 'true') return true
  const secret = process.env.CF_TURNSTILE_SECRET
  if (!secret) return true
  if (!token) return false
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }) as any,
    })
    const j = await res.json()
    return !!j?.success
  } catch (e) {
    return false
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const email = (body?.email || '').toString().trim().toLowerCase()
    const password = (body?.password || '').toString()
    const cfToken = body?.cf_turnstile_response || null
    if (!email || !password) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    // rate-limit: per-IP and per-email
    const ip = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown').toString().split(',')[0]
    const ipKey = `ip:${ip}`
    const emailKey = `email:${email}`
    if (isLocked(ipKey) || isLocked(emailKey)) return NextResponse.json({ error: 'Too many attempts, try later' }, { status: 429 })

    // Allow bypassing Turnstile for local debug by sending `_bypass: '1'` in the request body.
    if (process.env.CF_TURNSTILE_SECRET && String(body?._bypass || '') !== '1') {
      const ok = await verifyTurnstileToken(String(cfToken || ''))
      if (!ok) return NextResponse.json({ error: 'Captcha validation failed' }, { status: 400 })
    }

    const rows = await query<any[]>('SELECT id, email, name, hashed_password, is_active FROM users WHERE email = ? LIMIT 1', [email])
    const user = Array.isArray(rows) && rows.length ? rows[0] : null
    if (!user) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    if (!user.is_active) return NextResponse.json({ error: 'Account inactive' }, { status: 403 })

    const valid = user.hashed_password ? bcrypt.compareSync(password, user.hashed_password) : false
    if (!valid) {
      // record failures for IP and email
      try { incrementFailure(ipKey) } catch (_) {}
      try { incrementFailure(emailKey) } catch (_) {}
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // on success, reset failure counters for this IP/email
    try { resetKey(ipKey) } catch (_) {}
    try { resetKey(emailKey) } catch (_) {}

    // Ensure storage table exists (best-effort)
    try {
      await query('CREATE TABLE IF NOT EXISTS two_factor_codes (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id BIGINT, email VARCHAR(255), code_hash VARCHAR(255), expires_at DATETIME, used_at DATETIME DEFAULT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, INDEX (user_id), INDEX (email))')
    } catch (e) {
      // ignore
    }

    // generate 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000))
    const codeHash = await bcrypt.hash(code, 10)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    await query('INSERT INTO two_factor_codes (user_id, email, code_hash, expires_at) VALUES (?, ?, ?, ?)', [user.id, user.email, codeHash, expiresAt])
    try { /* eslint-disable no-console */ console.log('[api/auth/2fa/request] generated code for', { userId: user.id, email: user.email }) } catch (_) {}
    try { /* eslint-disable no-console */ console.log('[api/auth/2fa/request] code (debug):', code) } catch (_) {}

    // Send email via SendGrid if configured
    const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
    const FROM_EMAIL = process.env.SENDGRID_FROM || 'noreply@kf8fvd.com'
    if (SENDGRID_API_KEY) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
      const html = `
        <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.4;color:#111">
          <h3>Your sign-in verification code</h3>
          <p>Hi,</p>
          <p>Use the following verification code to complete signing in to your account. This code expires in 10 minutes.</p>
          <p style="font-size:20px;font-weight:600">${code}</p>
          <p>If you did not request this, you can ignore this email.</p>
        </div>`

      const bodyReq = {
        personalizations: [{ to: [{ email: user.email }], subject: 'Your sign-in code' }],
        from: { email: FROM_EMAIL, name: 'kf8fvd.com' },
        content: [{ type: 'text/html', value: html }]
      }

      try {
        await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyReq)
        })
      } catch (e) {
        // log but don't fail the request
        // eslint-disable-next-line no-console
        console.warn('[api/auth/2fa/request] sendgrid error', e)
      }
    }

    // In development, allow returning the code in the response when DEBUG_2FA=1
    // or when the client explicitly requests it with `_debug: '1'` in the POST body.
    if ((process.env.DEBUG_2FA || '').toString() === '1' || String(body?._debug || '') === '1') return NextResponse.json({ ok: true, debugCode: code })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
