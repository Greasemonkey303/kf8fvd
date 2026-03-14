import { NextResponse } from 'next/server'

function parseBasicAuth(header: string | null) {
  if (!header) return null
  const m = header.match(/^Basic (.+)$/i)
  if (!m) return null
  try {
    const decoded = Buffer.from(m[1], 'base64').toString('utf8')
    const idx = decoded.indexOf(':')
    if (idx < 0) return null
    return { user: decoded.slice(0, idx), pass: decoded.slice(idx + 1) }
  } catch (_) { return null }
}

function checkAdmin(req: Request) {
  const secret = process.env.ADMIN_API_KEY || ''
  const headerKey = req.headers.get('x-admin-key') || ''
  if (secret && headerKey && headerKey === secret) return { ok: true, actor: 'api-key', actor_type: 'api_key' }

  const auth = req.headers.get('authorization') || ''
  if (secret && auth.toLowerCase().startsWith('bearer ') && auth.slice(7) === secret) return { ok: true, actor: 'api-key', actor_type: 'api_key' }

  const basic = parseBasicAuth(auth)
  if (basic && process.env.ADMIN_BASIC_USER && process.env.ADMIN_BASIC_PASSWORD) {
    if (basic.user === process.env.ADMIN_BASIC_USER && basic.pass === process.env.ADMIN_BASIC_PASSWORD) return { ok: true, actor: basic.user, actor_type: 'basic' }
  }

  if (!process.env.ADMIN_API_KEY && !process.env.ADMIN_BASIC_USER && (process.env.NODE_ENV || 'development') !== 'production') return { ok: true, actor: 'dev', actor_type: 'dev' }

  return { ok: false }
}

export async function GET(req: Request) {
  const auth = checkAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  try {
    const url = new URL(req.url)
    const limit = Math.min(200, Number(url.searchParams.get('limit') || '50'))
    const offset = Math.max(0, Number(url.searchParams.get('offset') || '0'))
    const filterAction = url.searchParams.get('action') || null
    const filterActor = url.searchParams.get('actor') || null
    const format = (url.searchParams.get('format') || '').toLowerCase()

    try {
      const { query } = await import('@/lib/db')
      const params: unknown[] = []
      let where = ''
      if (filterAction) { where += (where ? ' AND ' : 'WHERE ') + 'action = ?'; params.push(filterAction) }
      if (filterActor) { where += (where ? ' AND ' : 'WHERE ') + 'actor = ?'; params.push(filterActor) }
      const countRows = await query<Array<Record<string, unknown>>>(`SELECT COUNT(*) as cnt FROM admin_actions ${where}`, params)
      const total = Array.isArray(countRows) && countRows[0] && typeof countRows[0].cnt !== 'undefined' ? Number(countRows[0].cnt) : 0

      const limitVal = Number(limit)
      const offsetVal = Number(offset)
      const rows = await query<Array<Record<string, unknown>>>(`SELECT id, actor, actor_type, action, target_key, reason, ip, meta, UNIX_TIMESTAMP(created_at) * 1000 as created_at_ms FROM admin_actions ${where} ORDER BY created_at DESC LIMIT ${limitVal} OFFSET ${offsetVal}`, params)
      const actions = Array.isArray(rows) ? rows.map((r: Record<string, unknown>) => {
        const metaRaw = r.meta
        let metaVal: unknown = {}
        try {
          if (typeof metaRaw === 'string') metaVal = JSON.parse(metaRaw || '{}')
          else metaVal = metaRaw ?? {}
        } catch (_) { metaVal = metaRaw }
        return {
          id: r.id,
          actor: r.actor,
          actor_type: r.actor_type,
          action: r.action,
          target_key: r.target_key,
          reason: r.reason,
          ip: r.ip,
          meta: metaVal,
          createdAt: r.created_at_ms
        }
      }) : []

      if (format === 'csv') {
        // log export action
        try {
          const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null
          const { insertAdminAction } = await import('@/lib/adminActions')
          await insertAdminAction({ actor: auth.actor, actor_type: auth.actor_type, action: 'export', target_key: 'admin_actions_csv', reason: null, ip, meta: { limit, offset, filterAction, filterActor } })
        } catch (_) {}
        // Build CSV header
        const cols = ['id', 'createdAt', 'actor', 'actor_type', 'action', 'target_key', 'reason', 'ip', 'meta']
        function esc(v: unknown) {
          if (v === null || typeof v === 'undefined') return ''
          const s = typeof v === 'string' ? v : String(v)
          return '"' + s.replace(/"/g, '""') + '"'
        }
        const lines = [cols.join(',')]
        for (const a of actions) {
          const metaStr = typeof a.meta === 'string' ? a.meta : JSON.stringify(a.meta || {})
          const row = [a.id, a.createdAt, a.actor, a.actor_type, a.action, a.target_key, a.reason, a.ip, metaStr].map(esc).join(',')
          lines.push(row)
        }
        const csv = lines.join('\n')
        return new NextResponse(csv, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="admin_actions.csv"'
          }
        })
      }

      return NextResponse.json({ ok: true, source: 'db', total, actions })
    } catch (e) {
      // If DB not available and CSV requested, return header-only CSV
      if (format === 'csv') {
        const header = 'id,createdAt,actor,actor_type,action,target_key,reason,ip,meta\n'
        return new NextResponse(header, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="admin_actions.csv"'
          }
        })
      }
      return NextResponse.json({ ok: true, source: 'none', total: 0, actions: [] })
    }
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
