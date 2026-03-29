import { NextResponse } from 'next/server'
import { incrementAbuseMetric } from '@/lib/abuseMetrics'
import { query } from '@/lib/db'
import { logRouteError, logRouteEvent } from '@/lib/observability'
import crypto from 'crypto'

const EXPIRE_HOURS = 2

function sha256(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const email = (body?.email || '').toString().trim().toLowerCase()
    if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 })
    try { await incrementAbuseMetric('password_reset_requests_total') } catch (e) { void e }

    // Find user (if any)
    type UserRow = { id: number; name?: string | null; email: string }
    const users = await query<UserRow[]>('SELECT id, name, email FROM users WHERE email = ? LIMIT 1', [email])
    const user = Array.isArray(users) && users.length ? users[0] : null

    // Always respond 200 to avoid account enumeration, but only create/send token if user exists
    if (!user) {
      try { await incrementAbuseMetric('password_reset_unknown_email_total') } catch (e) { void e }
      logRouteEvent('info', { route: 'api/forgot-password', action: 'request_accepted', resourceId: email, reason: 'user_not_found' })
      return NextResponse.json({ ok: true })
    }

    // generate token (random) and hash it for storage
    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = sha256(token)
    const expiresAt = new Date(Date.now() + EXPIRE_HOURS * 60 * 60 * 1000)

    // insert into password_resets
    await query('INSERT INTO password_resets (user_id, email, token_hash, expires_at) VALUES (?, ?, ?, ?)', [user.id, user.email, tokenHash, expiresAt])
    logRouteEvent('info', { route: 'api/forgot-password', action: 'token_issued', resourceId: user.email })

    // send email with reset link using SendGrid (reuse pattern from contact route)
    const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
    const FROM_EMAIL = process.env.SENDGRID_FROM || 'noreply@kf8fvd.com'
    if (!SENDGRID_API_KEY) {
      logRouteEvent('warn', { route: 'api/forgot-password', action: 'token_issued', resourceId: user.email, reason: 'sendgrid_not_configured' })
      return NextResponse.json({ ok: true })
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const resetUrl = `${siteUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`

    const safeName = (user.name || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.4;color:#111">
        <h3>Password reset request</h3>
        <p>Hi ${safeName || 'there'},</p>
        <p>We received a request to reset the password for the account ${user.email}. If this was you, click the link below to choose a new password. This link expires in ${EXPIRE_HOURS} hours.</p>
        <p><a href="${resetUrl}">Reset your password</a></p>
        <p>If you didn't request this, you can ignore this email.</p>
      </div>`

    const bodyReq = {
      personalizations: [{ to: [{ email: user.email }], subject: 'Reset your password' }],
      from: { email: FROM_EMAIL, name: 'kf8fvd.com' },
      content: [{ type: 'text/html', value: html }]
    }

    try {
      await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyReq)
      })
    } catch (err: unknown) {
      logRouteError('api/forgot-password', err, { action: 'send_reset_email', resourceId: user.email, reason: 'sendgrid_error' })
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    logRouteError('api/forgot-password', err, { action: 'request_reset', reason: 'invalid_request' })
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
