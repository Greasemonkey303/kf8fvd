import { NextResponse } from 'next/server'
import { incrementAbuseMetric } from '@/lib/abuseMetrics'
import { getRedis, resetKey } from '../../../../lib/rateLimiter'
import type { AdminActionDetails } from '../../../../lib/adminActions'
import { authorizeAdminRequest } from '@/lib/auth'
import { logRouteError, logRouteEvent } from '@/lib/observability'

// Use shared admin action helper
async function tryInsertAdminAction(details: AdminActionDetails | unknown) {
  try {
    const { insertAdminAction } = await import('../../../../lib/adminActions')
    await insertAdminAction(details as AdminActionDetails)
  } catch (e) {
    try { logRouteError('api/admin/auth-locks', e, { action: 'insert_admin_action', reason: 'audit_write_failed' }) } catch (inner) { void inner }
  }
}

export async function GET(req: Request) {
  const auth = await authorizeAdminRequest(req, { allowUtilityCredentials: true })
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
      logRouteEvent('info', { route: 'api/admin/auth-locks', action: 'list_locks', actor: auth.actor, actorType: auth.actor_type, reason: 'redis_source', resourceId: locks.length })
      return NextResponse.json({ ok: true, source: 'redis', locks })
    }
    // fallback to DB
    try {
      const { query } = await import('../../../../lib/db')
      const rows = await query<Array<Record<string, unknown>>>('SELECT key_name, UNIX_TIMESTAMP(locked_until) * 1000 as locked_at_ms FROM auth_locks WHERE locked_until > NOW()')
      const locks = Array.isArray(rows) ? rows.map((r: Record<string, unknown>) => ({ key: r.key_name, expiresAt: r.locked_at_ms })) : []
      logRouteEvent('info', { route: 'api/admin/auth-locks', action: 'list_locks', actor: auth.actor, actorType: auth.actor_type, reason: 'db_source', resourceId: locks.length })
      return NextResponse.json({ ok: true, source: 'db', locks })
    } catch (e) {
      void e
      logRouteEvent('warn', { route: 'api/admin/auth-locks', action: 'list_locks', actor: auth.actor, actorType: auth.actor_type, reason: 'no_lock_source' })
      return NextResponse.json({ ok: true, source: 'none', locks: [] })
    }
  } catch (e) {
    logRouteError('api/admin/auth-locks', e, { action: 'list_locks', actor: auth.actor, actorType: auth.actor_type, reason: 'route_exception' })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const auth = await authorizeAdminRequest(req, { allowUtilityCredentials: true })
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
      try { await incrementAbuseMetric('admin_unlocks_total') } catch (e) { void e }
      logRouteEvent('info', { route: 'api/admin/auth-locks', action: 'unlock', actor: auth.actor, actorType: auth.actor_type, resourceId: key, reason: body?.reason ? String(body.reason) : null })
      return NextResponse.json({ ok: true })
    } catch (e) {
      logRouteError('api/admin/auth-locks', e, { action: 'unlock', actor: auth.actor, actorType: auth.actor_type, resourceId: key, reason: 'reset_key_failed' })
      return NextResponse.json({ error: 'Failed to reset key' }, { status: 500 })
    }
  } catch (e) {
    logRouteError('api/admin/auth-locks', e, { action: 'unlock', actor: auth.actor, actorType: auth.actor_type, reason: 'invalid_request' })
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
