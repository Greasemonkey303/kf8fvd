import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { query } from '@/lib/db'

export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // Basic CSRF protection: require XHR header or same-origin Origin
  const xreq = req.headers.get('x-requested-with')
  const origin = req.headers.get('origin')
  const allowedOrigin = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
  if (!xreq || xreq.toLowerCase() !== 'xmlhttprequest') {
    if (!origin || !origin.startsWith(allowedOrigin)) return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  }

  // Accept JSON or form-data
  let key: string | null = null
  const ct = req.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    const body = await req.json().catch(() => null)
    key = body && typeof body.key_name === 'string' ? body.key_name : (body && typeof body.key === 'string' ? body.key : null)
  } else {
    const form = await req.formData()
    const k = form.get('key_name') || form.get('key')
    if (typeof k === 'string') key = k
  }

  if (!key) return NextResponse.json({ error: 'missing key' }, { status: 400 })
  await query('DELETE FROM auth_locks WHERE key_name = ?', [key])
  try {
    await query('INSERT INTO admin_actions (admin_user_id, action, target_key) VALUES (?, ?, ?)', [admin.id, 'unlock', key])
  } catch (err) {
    try { console.warn('[admin/utilities] failed to insert admin_actions', err) } catch (e) { void e }
  }
  return NextResponse.json({ ok: true })
}
