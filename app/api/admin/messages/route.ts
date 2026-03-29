import { NextResponse } from 'next/server'
import { requireAdmin } from '../../../../lib/auth'
import { query } from '../../../../lib/db'
import { parseJsonObject, readBoolean, readEnumString, readNumber, readNumberArray, validationErrorResponse } from '@/lib/validation'

export const dynamic = 'force-dynamic'

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init)
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  response.headers.set('Pragma', 'no-cache')
  response.headers.set('Expires', '0')
  return response
}

export async function GET(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return jsonNoStore({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1)
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100', 10), 1), 1000)
  const offset = (page - 1) * limit

  // support lightweight unread count query
  const unreadOnly = url.searchParams.get('unread')
  if (unreadOnly === 'true' || unreadOnly === '1') {
    const rows = await query<{ unread: number }[]>('SELECT COUNT(*) as unread FROM messages WHERE is_deleted=0 AND is_read=0')
    const unread = (rows && rows[0] && typeof rows[0].unread === 'number') ? rows[0].unread : 0
    return jsonNoStore({ unread })
  }

  const rows = await query<Array<Record<string, unknown>>>(`SELECT id, name, email, message, message_sanitized, attachments, ip, user_agent, is_read, created_at FROM messages WHERE is_deleted=0 ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`)
  const totalRows = await query<{ total: number }[]>('SELECT COUNT(*) as total FROM messages WHERE is_deleted=0')
  const unreadRows = await query<{ unread: number }[]>('SELECT COUNT(*) as unread FROM messages WHERE is_deleted=0 AND is_read=0')
  const total = totalRows && totalRows[0] ? totalRows[0].total : 0
  const unread = unreadRows && unreadRows[0] ? unreadRows[0].unread : 0

  const items = (rows || []).map(r => ({
    id: r.id,
    name: r.name,
    email: r.email,
    // keep raw message available for plain-text previews, expose sanitized HTML separately
    message: String(r.message || ''),
    message_sanitized: (r.message_sanitized && String(r.message_sanitized).length) ? String(r.message_sanitized) : null,
    attachments: ((): Array<Record<string, unknown>> => {
      const parsed = typeof r.attachments === 'string' ? JSON.parse(r.attachments || '[]') : (r.attachments || [])
      return (parsed || []).map((a: unknown) => {
        try {
          if (a && typeof a === 'object' && (a as Record<string, unknown>).key && (a as Record<string, unknown>).filename) {
            const obj = a as Record<string, unknown>
            const params = new URLSearchParams({ key: String(obj.key), filename: String(obj.filename), type: String(obj.type || '') })
            return { ...obj, url: `/admin/api/messages/attachments?${params.toString()}` }
          }
          if (a && typeof a === 'object' && (a as Record<string, unknown>).dir && (a as Record<string, unknown>).filename) {
            const obj = a as Record<string, unknown>
            const params = new URLSearchParams({ dir: String(obj.dir), filename: String(obj.filename), type: String(obj.type || '') })
            return { ...obj, url: `/admin/api/messages/attachments?${params.toString()}` }
          }
        } catch (e) { void e }
        return a as Record<string, unknown>
      })
    })(),
    ip: r.ip,
    user_agent: r.user_agent,
    is_read: Number(r.is_read) === 1,
    created_at: r.created_at,
  }))

  return jsonNoStore({ items, page, limit, total, unread })
}

export async function PATCH(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let id: number | null
  let ids: number[] | null
  let read: boolean | null
  let action: string | null
  try {
    const body = await parseJsonObject(req)
    id = readNumber(body, 'id', { integer: true, min: 1 })
    ids = readNumberArray(body, 'ids', { integer: true, min: 1, maxItems: 1000 })
    read = readBoolean(body, 'read')
    action = readEnumString(body, 'action', ['mark_all_read'])
  } catch (error) {
    const response = validationErrorResponse(error)
    if (response) return response
    throw error
  }

  if (id != null) {
    await query('UPDATE messages SET is_read = ? WHERE id = ?', [read ? 1 : 0, id])
    return NextResponse.json({ ok: true })
  }

  if (Array.isArray(ids) && ids.length) {
    const placeholders = ids.map(() => '?').join(',')
    await query(`UPDATE messages SET is_read = ? WHERE id IN (${placeholders})`, [read ? 1 : 0, ...ids])
    return NextResponse.json({ ok: true })
  }

  if (action === 'mark_all_read') {
    await query('UPDATE messages SET is_read = 1 WHERE is_deleted=0')
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
}

export async function DELETE(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (id) {
    await query('UPDATE messages SET is_deleted = 1 WHERE id = ?', [id])
    return NextResponse.json({ ok: true })
  }
  let ids: number[] | null = null
  try {
    const body = await parseJsonObject(req)
    ids = readNumberArray(body, 'ids', { integer: true, min: 1, maxItems: 1000 })
  } catch (error) {
    const response = validationErrorResponse(error)
    if (response) return response
  }
  if (Array.isArray(ids) && ids.length) {
    const placeholders = ids.map(() => '?').join(',')
    await query(`UPDATE messages SET is_deleted = 1 WHERE id IN (${placeholders})`, ids)
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Missing id' }, { status: 400 })
}
