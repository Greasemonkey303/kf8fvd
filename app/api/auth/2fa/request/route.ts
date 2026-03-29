import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { isLocked, incrementFailure, resetKey } from '@/lib/rateLimiter'
import { verifyTurnstileToken } from '@/lib/turnstile'
import { logRouteError, logRouteEvent } from '@/lib/observability'

// verifyTurnstileToken now provided by '@/lib/turnstile'

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const email = (body?.email || '').toString().trim().toLowerCase()
    const password = (body?.password || '').toString()
    const cfToken = body?.cf_turnstile_response || null
    const allowBypass = process.env.NODE_ENV !== 'production' && String(body?._bypass || '') === '1'
    if (!email || !password) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    // rate-limit: per-IP and per-email
    const ip = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown').toString().split(',')[0]
    const ipKey = `ip:${ip}`
    const emailKey = `email:${email}`
    if (await isLocked(ipKey) || await isLocked(emailKey)) {
      logRouteEvent('warn', { route: 'api/auth/2fa/request', action: '2fa_request_rejected', ip, resourceId: email, reason: 'lock_active', status: 429 })
      return NextResponse.json({ error: 'Too many attempts, try later' }, { status: 429 })
    }

    // Allow bypassing Turnstile for local debug by sending `_bypass: '1'` in the request body.
    if (process.env.CF_TURNSTILE_SECRET && !allowBypass) {
      const ok = await verifyTurnstileToken(String(cfToken || ''))
      if (!ok) {
        logRouteEvent('warn', { route: 'api/auth/2fa/request', action: '2fa_request_rejected', ip, resourceId: email, reason: 'captcha_failed', status: 400 })
        return NextResponse.json({ error: 'Captcha validation failed' }, { status: 400 })
      }
    }

    const rows = await query<Record<string, unknown>[]>('SELECT id, email, name, hashed_password, is_active FROM users WHERE email = ? LIMIT 1', [email])
    const user = Array.isArray(rows) && rows.length ? rows[0] : null
    if (!user) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    if (!user.is_active) return NextResponse.json({ error: 'Account inactive' }, { status: 403 })

    const userEmail = typeof user.email === 'string' ? user.email : String(user.email || '')
    const userId = typeof user.id === 'number' || typeof user.id === 'string' ? user.id : null

    const valid = user.hashed_password ? bcrypt.compareSync(password, String(user.hashed_password)) : false
    if (!valid) {
      // record failures for IP and email
      try { await incrementFailure(ipKey, { reason: 'invalid_password' }) } catch (e) { void e }
      try { await incrementFailure(emailKey, { reason: 'invalid_password' }) } catch (e) { void e }
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // on success, reset failure counters for this IP/email
    try { await resetKey(ipKey) } catch (e) { void e }
    try { await resetKey(emailKey) } catch (e) { void e }

    // generate 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000))
    const codeHash = await bcrypt.hash(code, 10)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    await query('INSERT INTO two_factor_codes (user_id, email, code_hash, expires_at) VALUES (?, ?, ?, ?)', [userId, userEmail, codeHash, expiresAt])
    if (process.env.NODE_ENV !== 'production') {
      logRouteEvent('debug', { route: 'api/auth/2fa/request', action: '2fa_code_generated', ip, actor: userEmail, resourceId: userId })
    }

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
          <p><a href="${siteUrl}">${siteUrl}</a></p>
        </div>`

      const bodyReq = {
        personalizations: [{ to: [{ email: userEmail }], subject: 'Your sign-in code' }],
        from: { email: FROM_EMAIL, name: 'kf8fvd.com' },
        content: [{ type: 'text/html', value: html }]
      }

      try {
        const sendgridRes = await fetchWithTimeout('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyReq)
        }, 5000)
        if (!sendgridRes.ok) {
          logRouteEvent('warn', { route: 'api/auth/2fa/request', action: '2fa_email_send', ip, actor: userEmail, resourceId: userId, status: sendgridRes.status, reason: 'sendgrid_non_2xx' })
        }
      } catch (e) {
        // log but don't fail the request
        logRouteError('api/auth/2fa/request', e, { action: '2fa_email_send', ip, actor: userEmail, resourceId: userId, reason: 'sendgrid_request_failed' })
      }
    }

    // In development, allow returning the code in the response when DEBUG_2FA=1
    // or when the client explicitly requests it with `_debug: '1'` in the POST body.
    if (process.env.NODE_ENV !== 'production' && (((process.env.DEBUG_2FA || '').toString() === '1') || String(body?._debug || '') === '1')) {
      return NextResponse.json({ ok: true, debugCode: code })
    }
    logRouteEvent('info', { route: 'api/auth/2fa/request', action: '2fa_requested', ip, actor: userEmail, resourceId: userId })
    return NextResponse.json({ ok: true })
  } catch (e) {
    logRouteError('api/auth/2fa/request', e, { action: '2fa_request_failed', reason: 'invalid_request' })
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
