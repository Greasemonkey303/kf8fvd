import { NextResponse } from 'next/server'

type SGAttachment = {
  content: string
  filename: string
  type: string
  disposition: string
  content_id?: string
}

import fs from 'fs/promises'

export async function POST(req: Request) {
  try {
    const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
    const FROM_EMAIL = process.env.SENDGRID_FROM || 'noreply@kf8fvd.com'
    const TO_EMAIL = process.env.SENDGRID_TO || 'zach@kf8fvd'

    if (!SENDGRID_API_KEY) {
      return NextResponse.json({ error: 'Missing SENDGRID_API_KEY' }, { status: 500 })
    }

    const form = await req.formData()
    // honeypot check
    const honeypot = form.get('hp')?.toString() || ''
    if (honeypot.trim()) {
      console.warn('[api/contact] honeypot triggered')
      return NextResponse.json({ error: 'Spam detected' }, { status: 400 })
    }

    // Cloudflare Turnstile verification (if configured)
    const cfToken = form.get('cf-turnstile-response')?.toString() || form.get('cf-turnstile-response')?.toString() || form.get('cf-turnstile')?.toString() || ''
    const CF_SECRET = process.env.CF_TURNSTILE_SECRET
    if (CF_SECRET) {
      if (!cfToken) {
        return NextResponse.json({ error: 'Missing Turnstile token' }, { status: 400 })
      }
      const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `secret=${encodeURIComponent(CF_SECRET)}&response=${encodeURIComponent(cfToken)}`,
      })
      const vr = await verifyRes.json()
      if (!vr.success) {
        console.warn('[api/contact] turnstile failed', vr)
        return NextResponse.json({ error: 'Turnstile verification failed', details: vr }, { status: 400 })
      }
    }
    const name = form.get('name')?.toString() || 'Website visitor'
    const email = form.get('email')?.toString() || ''
    const message = form.get('message')?.toString() || ''

    const attachments: SGAttachment[] = []
    for (const entry of form.entries()) {
      const [, value] = entry
      // value may be a File when the client posts FormData with files
      // @ts-ignore
      if (typeof File !== 'undefined' && value instanceof File) {
        // @ts-ignore
        const file = value as File
        const ab = await file.arrayBuffer()
        const uint8 = new Uint8Array(ab)
        const base64 = Buffer.from(uint8).toString('base64')
        const isImage = (file.type || '').startsWith('image/')
        attachments.push({
          content: base64,
          filename: file.name,
          type: file.type || 'application/octet-stream',
          disposition: isImage ? 'inline' : 'attachment',
          // set content_id for inline images so they can be referenced by cid
          ...(isImage ? { content_id: file.name } : {}),
        })
      }
    }

    // server-side email validation (simple)
    const emailIsValid = typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

    // Always use the verified `SENDGRID_FROM` as the envelope 'from' to satisfy SendGrid.
    // Use the visitor's email in `reply_to` so you can reply directly.
    function escapeHtml(str: string) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
    }

    const sentAt = new Date().toUTCString()
    const safeName = escapeHtml(name)
    const safeEmail = escapeHtml(email)
    const safeMessage = escapeHtml(message).replace(/\r?\n/g, '<br/>')
    const userAgent = req.headers.get('user-agent') || 'unknown'
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'

    const plain = `Name: ${name}\nEmail: ${email}\n\n${message}\n\nSent: ${sentAt}`
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.4;color:#111">
        <h2 style="margin:0 0 8px 0">New message from your website</h2>
        <p style="margin:0 0 12px 0;color:#555">
          <strong>From:</strong> ${safeName} &lt;<a href="mailto:${safeEmail}">${safeEmail}</a>&gt;<br/>
          <strong>Received:</strong> ${sentAt}
        </p>
        <hr style="border:none;border-top:1px solid #eee;margin:12px 0"/>
        <div style="white-space:normal;color:#111">${safeMessage}</div>
        ${attachments.length ? `<hr style="border:none;border-top:1px solid #eee;margin:12px 0"/><p style="margin:0 0 8px 0;color:#555"><strong>Attachments:</strong> ${attachments.map(a=>escapeHtml(a.filename)).join(', ')}</p>` : ''}
        ${attachments.filter(a=> (a.type||'').startsWith('image/')).length ? `<div style="margin-top:12px">${attachments.filter(a=> (a.type||'').startsWith('image/')).map(a=>`<img src="cid:${escapeHtml(a.filename)}" alt="${escapeHtml(a.filename)}" style="max-width:240px;display:block;margin:8px 0;border-radius:6px;border:1px solid #eee"/>`).join('')}</div>` : ''}
        <p style="margin:12px 0 0 0;color:#666;font-size:12px">Visitor IP: ${escapeHtml(ip)} • User agent: ${escapeHtml(userAgent)}</p>
        <p style="margin:8px 0 0 0;color:#888;font-size:12px">This message was sent via kf8fvd.com contact form.</p>
      </div>
    `

    const body: any = {
      personalizations: [
        {
          to: [{ email: TO_EMAIL }],
          subject: `Website contact from ${safeName || 'visitor'}`,
        },
      ],
      from: { email: FROM_EMAIL, name: 'kf8fvd.com' },
      reply_to: emailIsValid ? { email, name } : undefined,
      content: [
        { type: 'text/plain', value: plain },
        { type: 'text/html', value: html },
      ],
    }

    if (attachments.length) body.attachments = attachments

    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('[api/contact] SendGrid error', res.status, text)
      return NextResponse.json({ error: 'SendGrid error', details: text, status: res.status }, { status: 500 })
    }

    // append message to local log for backup/inspection
    try {
      const outDir = './data'
      await fs.mkdir(outDir, { recursive: true })
      const logLine = JSON.stringify({ name, email, message, attachments: attachments.map(a=>a.filename), ip, userAgent, sentAt: new Date().toISOString() }) + '\n'
      await fs.appendFile(`${outDir}/messages.log`, logLine, 'utf8')
    } catch (e) {
      console.error('[api/contact] failed to write message log', e)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
