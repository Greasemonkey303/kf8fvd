import { NextResponse } from 'next/server'
import { getRedis, resetKey } from '../../../../lib/rateLimiter'
import type { AdminActionDetails } from '../../../../lib/adminActions'

// Use shared admin action helper
async function tryInsertAdminAction(details: AdminActionDetails | unknown) {
  try {
    const { insertAdminAction } = await import('../../../../lib/adminActions')
    await insertAdminAction(details as AdminActionDetails)
  } catch (e) {
    try { console.warn('[admin] failed to write admin_actions', e) } catch (inner) { void inner }
  }
}

function parseBasicAuth(header: string | null) {
  if (!header) return null
  const m = header.match(/^Basic (.+)$/i)
  if (!m) return null
  try {
    const decoded = Buffer.from(m[1], 'base64').toString('utf8')
    const idx = decoded.indexOf(':')
    if (idx < 0) return null
    return { user: decoded.slice(0, idx), pass: decoded.slice(idx + 1) }
  } catch (e) { void e; return null }
}

function checkAdmin(req: Request) {
  const secret = process.env.ADMIN_API_KEY || ''
  const headerKey = req.headers.get('x-admin-key') || ''
  if (secret && headerKey && headerKey === secret) return { ok: true, actor: 'api-key', actor_type: 'api_key' }

  // allow bearer token equal to ADMIN_API_KEY as legacy
  const auth = req.headers.get('authorization') || ''
  if (secret && auth.toLowerCase().startsWith('bearer ') && auth.slice(7) === secret) return { ok: true, actor: 'api-key', actor_type: 'api_key' }

  // Basic auth fallback: check against ADMIN_BASIC_USER/PASSWORD env
  const basic = parseBasicAuth(auth)
  if (basic && process.env.ADMIN_BASIC_USER && process.env.ADMIN_BASIC_PASSWORD) {
    if (basic.user === process.env.ADMIN_BASIC_USER && basic.pass === process.env.ADMIN_BASIC_PASSWORD) return { ok: true, actor: basic.user, actor_type: 'basic' }
  }

  // Allow non-production convenience if no admin key is configured
  if (!process.env.ADMIN_API_KEY && !process.env.ADMIN_BASIC_USER && (process.env.NODE_ENV || 'development') !== 'production') return { ok: true, actor: 'dev', actor_type: 'dev' }

  return { ok: false }
}

export async function GET(req: Request) {
  const auth = checkAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  try {
    const r = await getRedis()
    if (r) {
      // list locks from redis keys rl:lock:* (guard if client doesn't expose `keys`)
      type RedisLike = { keys?: (pattern: string) => Promise<string[]>; pttl?: (key: string) => Promise<number> }
      const redisClient = r as unknown as RedisLike
      const keys = (typeof redisClient.keys === 'function') ? await redisClient.keys('rl:lock:*') : []
      const locks: Array<{ key: string; redisKey?: string; ttlMs?: number | null; expiresAt?: number | null }> = []
      for (const k of keys) {
        try {
          let ttl: number | null = null
          if (typeof redisClient.pttl === 'function') {
            try { ttl = await redisClient.pttl(k) } catch (e) { void e; ttl = null }
          }
          const name = decodeURIComponent(String(k).slice('rl:lock:'.length))
          locks.push({ key: name, redisKey: k, ttlMs: (typeof ttl === 'number' && ttl > 0) ? ttl : null, expiresAt: (typeof ttl === 'number' && ttl > 0) ? Date.now() + ttl : null })
        } catch (e) { void e /* ignore per-key errors */ }
      }
      return NextResponse.json({ ok: true, source: 'redis', locks })
    }
    // fallback to DB
    try {
      const { query } = await import('../../../../lib/db')
      const rows = await query<Array<Record<string, unknown>>>('SELECT key_name, UNIX_TIMESTAMP(locked_until) * 1000 as locked_at_ms FROM auth_locks WHERE locked_until > NOW()')
      const locks = Array.isArray(rows) ? rows.map((r: Record<string, unknown>) => ({ key: r.key_name, expiresAt: r.locked_at_ms })) : []
      return NextResponse.json({ ok: true, source: 'db', locks })
    } catch (e) {
      void e
      return NextResponse.json({ ok: true, source: 'none', locks: [] })
    }
  } catch (e) {
    void e
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const auth = checkAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  try {
    const body = await req.json()
    const key = String(body?.key || '')
    if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 })
    try {
      await resetKey(key)
      // audit the unlock action (best-effort)
      try {
        const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null
        await tryInsertAdminAction({ actor: auth.actor, actor_type: auth.actor_type, action: 'unlock', target_key: key, reason: body?.reason || null, ip, meta: { source: 'admin_api' } })
      } catch (e) { void e }
      return NextResponse.json({ ok: true })
    } catch (e) {
      void e
      return NextResponse.json({ error: 'Failed to reset key' }, { status: 500 })
    }
  } catch (e) {
    void e
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
