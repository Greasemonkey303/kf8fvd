import { NextResponse } from 'next/server'
import { isLocked, incrementFailure } from '@/lib/rateLimiter'
import { incrementAbuseMetric } from '@/lib/abuseMetrics'
import { verifyTurnstileToken } from '@/lib/turnstile'
import { query } from '@/lib/db'
import { createObjectStorageClient, getObjectStorageBucket } from '@/lib/objectStorage'
import { logRouteError, logRouteEvent } from '@/lib/observability'
import { generateWebpVariantForObject } from '@/lib/webpVariants'

type SGAttachment = {
  content: string
  filename: string
  type: string
  disposition: string
  content_id?: string
}

type SavedAttachmentMeta = {
  filename: string
  type: string
  dir?: string
  key?: string
  storage?: string
  variants?: { webp?: string } | null
}

import fs from 'fs/promises'
import path from 'path'

const getErrMsg = (err: unknown) => {
  if (err instanceof Error) return err.message
  try { return String(err) } catch { return 'Unknown error' }
}

function jsonErr(code: string, message: string, details?: unknown, status = 400) {
  return NextResponse.json({ error: { code, message, details } }, { status })
}

// File limits
const MAX_TOTAL = 50 * 1024 * 1024 // 50MB total
const MAX_PER_FILE = 50 * 1024 * 1024 // 50MB per file
const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf', 'text/']
const ALLOWED_MIME_EXACT = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

function isAllowedMime(mime: string, filename: string) {
  if (!mime || typeof mime !== 'string') {
    const ext = (filename || '').split('.').pop()?.toLowerCase() || ''
    return ['png','jpg','jpeg','gif','webp','pdf','txt','doc','docx'].includes(ext)
  }
  for (const p of ALLOWED_MIME_PREFIXES) if (mime.startsWith(p)) return true
  if (ALLOWED_MIME_EXACT.includes(mime)) return true
  return false
}

export async function POST(req: Request) {
  try {
    const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
    const FROM_EMAIL = process.env.SENDGRID_FROM || 'noreply@kf8fvd.com'
    const TO_EMAIL = process.env.SENDGRID_TO || 'zach@kf8fvd'

    if (!SENDGRID_API_KEY) {
      return jsonErr('MISSING_CONFIG', 'Missing SENDGRID_API_KEY', undefined, 500)
    }

    const form = await req.formData()
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || req.headers.get('x-forwarded') || 'unknown'
    const userAgent = req.headers.get('user-agent') || 'unknown'

    const emailFromForm = (form.get('email')?.toString() || '').trim()
    const ipKey = `ip:${ip}`
    const emailKey = emailFromForm ? `email:${emailFromForm}` : null

    // rate limiter: check centralized limiter (IP and optional email)
    try {
      if (await isLocked(ipKey) || (emailKey && await isLocked(emailKey))) {
        try { await incrementAbuseMetric('contact_abuse_total') } catch (e) { void e }
        logRouteEvent('warn', { route: 'api/contact', action: 'rate_limit_rejected', ip, reason: 'lock_active' })
        return jsonErr('RATE_LIMIT', 'Rate limit exceeded', undefined, 429)
      }
    } catch (e) {
      logRouteError('api/contact', e, { action: 'rate_limit_check', ip, reason: 'limiter_check_failed' })
    }

    // honeypot check
    const honeypot = form.get('hp')?.toString() || ''
    if (honeypot.trim()) {
      try { await incrementAbuseMetric('contact_abuse_total') } catch (e) { void e }
      logRouteEvent('warn', { route: 'api/contact', action: 'spam_rejected', ip, reason: 'honeypot' })
      try { await incrementFailure(ipKey, { reason: 'honeypot' }) } catch (e) { void e }
      if (emailKey) try { await incrementFailure(emailKey, { reason: 'honeypot' }) } catch (e) { void e }
      return jsonErr('SPAM', 'Spam detected', undefined, 400)
    }

    // Cloudflare Turnstile verification (if configured)
    const cfToken = form.get('cf-turnstile-response')?.toString() || form.get('cf-turnstile')?.toString() || ''
    const CF_SECRET = process.env.CF_TURNSTILE_SECRET
    if (CF_SECRET) {
      if (!cfToken) {
        try { await incrementAbuseMetric('contact_abuse_total') } catch (e) { void e }
        try { await incrementFailure(ipKey, { reason: 'turnstile_missing' }) } catch (e) { void e }
        return jsonErr('MISSING_CAPTCHA', 'Missing CAPTCHA token', undefined, 400)
      }
      const ok = await verifyTurnstileToken(cfToken)
      if (!ok) {
        try { await incrementAbuseMetric('contact_abuse_total') } catch (e) { void e }
        logRouteEvent('warn', { route: 'api/contact', action: 'captcha_rejected', ip, reason: 'turnstile_failed' })
        try { await incrementFailure(ipKey, { reason: 'turnstile_failed' }) } catch (e) { void e }
        return jsonErr('CAPTCHA_FAILED', 'CAPTCHA verification failed', undefined, 400)
      }
    }

    const name = form.get('name')?.toString() || 'Website visitor'
    const email = emailFromForm || ''
    const message = form.get('message')?.toString() || ''

    const attachments: SGAttachment[] = []
    let totalBytes = 0
    for (const entry of form.entries()) {
      const [, value] = entry
      const maybeFile = value as unknown
      if (maybeFile && typeof (maybeFile as { name?: unknown }).name === 'string' && typeof (maybeFile as { arrayBuffer?: unknown }).arrayBuffer === 'function') {
        const file = maybeFile as File
        const ab = await file.arrayBuffer()
        const uint8 = new Uint8Array(ab)
        const bytes = uint8.byteLength
        // per-file size check
        if (bytes > MAX_PER_FILE) {
          try { await incrementAbuseMetric('contact_abuse_total') } catch (e) { void e }
          try { await incrementFailure(ipKey, { reason: 'file_too_large' }) } catch (e) { void e }
          return jsonErr('FILE_TOO_LARGE', 'An attachment exceeds the per-file size limit', { filename: file.name }, 413)
        }
        totalBytes += bytes
        if (totalBytes > MAX_TOTAL) {
          try { await incrementAbuseMetric('contact_abuse_total') } catch (e) { void e }
          try { await incrementFailure(ipKey, { reason: 'total_size_exceeded' }) } catch (e) { void e }
          return jsonErr('TOTAL_TOO_LARGE', 'Total attachments exceed 50MB limit', undefined, 413)
        }
        const mime = file.type || ''
        if (!isAllowedMime(mime, file.name)) {
          try { await incrementAbuseMetric('contact_abuse_total') } catch (e) { void e }
          try { await incrementFailure(ipKey, { reason: 'unsupported_file_type' }) } catch (e) { void e }
          return jsonErr('UNSUPPORTED_FILE_TYPE', 'Attachment type is not allowed', { filename: file.name, type: mime }, 415)
        }
        const base64 = Buffer.from(uint8).toString('base64')
        const isImage = (file.type || '').startsWith('image/')
        const attachment: SGAttachment = {
          content: base64,
          filename: file.name,
          type: file.type || 'application/octet-stream',
          disposition: isImage ? 'inline' : 'attachment',
        }
        if (isImage) (attachment as SGAttachment).content_id = file.name
        attachments.push(attachment)
      }
    }

    let savedAttachmentsMeta: SavedAttachmentMeta[] = []
    if (attachments.length) {
      logRouteEvent('debug', { route: 'api/contact', action: 'attachments_received', ip, resourceId: attachments.length, filenames: attachments.map((attachment) => attachment.filename) })
      // store contact attachments in MinIO so backup and restore discipline matches other site media.
      try {
        const uploadDir = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`
        const bucket = getObjectStorageBucket()
        if (!bucket) throw new Error('Bucket not configured for contact attachments')
        const minioClient = createObjectStorageClient()
        for (const a of attachments) {
          try {
            const safeName = path.basename(a.filename || 'file')
            const key = `messages/${uploadDir}/${safeName}`
            const buffer = Buffer.from(a.content || '', 'base64')
            await minioClient.putObject(bucket, key, buffer, buffer.length, { 'Content-Type': a.type || 'application/octet-stream' })
            let variants: SavedAttachmentMeta['variants'] = null
            if ((a.type || '').startsWith('image/')) {
              try {
                const variant = await generateWebpVariantForObject(key)
                if (variant?.webpKey) variants = { webp: variant.webpKey }
              } catch (variantError) {
                logRouteError('api/contact', variantError, { action: 'generate_attachment_webp_variant', ip, resourceId: key, reason: 'webp_variant_failed' })
              }
            }
            savedAttachmentsMeta.push({ filename: safeName, type: a.type || 'application/octet-stream', key, storage: 'minio', variants })
          } catch (e) {
            logRouteError('api/contact', e, { action: 'persist_attachment', ip, resourceId: a.filename || null, reason: 'object_storage_write_failed' })
            savedAttachmentsMeta.push({ filename: a.filename || 'file', type: a.type || 'application/octet-stream' })
          }
        }
      } catch (e) {
        logRouteError('api/contact', e, { action: 'persist_attachments', ip, reason: 'attachment_directory_failed' })
        savedAttachmentsMeta = attachments.map(a => ({ filename: a.filename, type: a.type }))
      }
    }

    const emailIsValid = typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

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
    // plain sanitized text for DB/storage (no <br/> tags)
    const sanitizedForDb = escapeHtml(message)

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
        ${attachments.filter(a=> (a.type||'').startsWith('image/')).length ? `<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">${attachments.filter(a=> (a.type||'').startsWith('image/')).map(a=>`<img src="cid:${escapeHtml(a.filename)}" alt="${escapeHtml(a.filename)}" style="width:120px;height:90px;object-fit:cover;border-radius:6px;border:1px solid #eee"/>`).join('')}</div>` : ''}
        <p style="margin:12px 0 0 0;color:#666;font-size:12px">Visitor IP: ${escapeHtml(ip)} • User agent: ${escapeHtml(userAgent)}</p>
        <p style="margin:8px 0 0 0;color:#888;font-size:12px">This message was sent via kf8fvd.com contact form.</p>
      </div>
    `

    const body: Record<string, unknown> = {
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

    if (attachments.length) (body as Record<string, unknown>).attachments = attachments

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
      logRouteEvent('error', { route: 'api/contact', action: 'send_contact_email', ip, status: res.status, reason: 'sendgrid_error', responseBody: process.env.NODE_ENV === 'production' ? undefined : text })
      try { await incrementFailure(ipKey, { reason: 'sendgrid_error' }) } catch (e) { void e }
      if (emailKey) try { await incrementFailure(emailKey, { reason: 'sendgrid_error' }) } catch (e) { void e }
      return jsonErr('SENDGRID_ERROR', 'SendGrid error', text, 502)
    }

    // append message to local log for backup/inspection
    try {
      const outDir = './data'
      await fs.mkdir(outDir, { recursive: true })
      const logLine = JSON.stringify({ name: safeName, email: safeEmail, message: sanitizedForDb, message_sanitized: safeMessage, attachments: attachments.map(a=>a.filename), ip, userAgent, sentAt: new Date().toISOString() }) + '\n'
      await fs.appendFile(`${outDir}/messages.log`, logLine, 'utf8')
    } catch (e) {
      logRouteError('api/contact', e, { action: 'write_message_log', ip, reason: 'message_log_write_failed' })
    }

    // persist message to database (non-blocking: log errors but don't fail the request)
    try {
      const attachmentsMeta = (savedAttachmentsMeta && savedAttachmentsMeta.length) ? savedAttachmentsMeta : attachments.map(a => ({ filename: a.filename, type: a.type }))
      // store both plain-text `message` and server-safe HTML `message_sanitized` for rendering
      await query('INSERT INTO messages (name, email, message, message_sanitized, attachments, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)', [name || null, email || null, sanitizedForDb || null, safeMessage || null, JSON.stringify(attachmentsMeta), ip || null, userAgent || null])
    } catch (dbErr) {
      logRouteError('api/contact', dbErr, { action: 'persist_message', ip, reason: 'db_insert_failed' })
    }

    // send a confirmation email to the visitor (if valid)
    if (emailIsValid) {
      try {
        const confirmPlain = `Hi ${name},\n\nThanks for contacting me. I received your message and will reply as soon as I can.\n\nYour message:\n${message}`
        const confirmHtml = `<p>Hi ${escapeHtml(name)},</p><p>Thanks for contacting me. I received your message and will reply as soon as I can.</p><hr/><div>${safeMessage}</div>`
        const confirmBody = {
          personalizations: [{ to: [{ email }], subject: 'Thanks — I received your message' }],
          from: { email: FROM_EMAIL, name: 'kf8fvd.com' },
          content: [ { type: 'text/plain', value: confirmPlain }, { type: 'text/html', value: confirmHtml } ],
        }
        await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(confirmBody),
        })
      } catch (e) {
        logRouteError('api/contact', e, { action: 'send_confirmation_email', ip, reason: 'sendgrid_confirmation_failed' })
      }
    }

    logRouteEvent('info', { route: 'api/contact', action: 'message_accepted', ip, resourceId: email || null, attachmentCount: attachments.length })
    try { await incrementAbuseMetric('contact_messages_total') } catch (e) { void e }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    logRouteError('api/contact', err, { action: 'unhandled_error', reason: 'request_failed' })
    return jsonErr('SERVER_ERROR', getErrMsg(err), undefined, 500)
  }
}
