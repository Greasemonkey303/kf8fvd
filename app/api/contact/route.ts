import { NextResponse } from 'next/server'

type SGAttachment = {
  content: string
  filename: string
  type: string
  disposition: string
}

export async function POST(req: Request) {
  try {
    const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
    const FROM_EMAIL = process.env.SENDGRID_FROM || 'noreply@kf8fvd.com'
    const TO_EMAIL = process.env.SENDGRID_TO || 'zach@kf8fvd'

    if (!SENDGRID_API_KEY) {
      return NextResponse.json({ error: 'Missing SENDGRID_API_KEY' }, { status: 500 })
    }

    const form = await req.formData()
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
        attachments.push({
          content: base64,
          filename: file.name,
          type: file.type || 'application/octet-stream',
          disposition: 'attachment'
        })
      }
    }

    // server-side email validation (simple)
    const emailIsValid = typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

    // Always use the verified `SENDGRID_FROM` as the envelope 'from' to satisfy SendGrid.
    // Use the visitor's email in `reply_to` so you can reply directly.
    const body: any = {
      personalizations: [
        {
          to: [{ email: TO_EMAIL }],
          subject: `Website contact from ${name}`,
        },
      ],
      from: { email: FROM_EMAIL, name: 'kf8fvd.com' },
      reply_to: emailIsValid ? { email, name } : undefined,
      content: [
        {
          type: 'text/plain',
          value: `Name: ${name}\nEmail: ${email}\n\n${message}`,
        },
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

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
