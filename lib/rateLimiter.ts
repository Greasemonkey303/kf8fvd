import {
  getRateWindowMs,
  getRateMax,
  getRateLockMs,
  getRedisUrl,
  getMetricsPrefix,
  getMetricsTtlSec,
} from './rateLimiterConfig'

type Entry = {
  count: number
  firstAt: number
  lockedUntil?: number
}

const store = new Map<string, Entry>()

function now() { return Date.now() }

function metricKey(name: string) {
  return `metrics:${getMetricsPrefix()}:${name}`
}

const DISABLE_DB_FALLBACK = !!process.env.DISABLE_DB_FALLBACK

let _redis: any | null = null
export async function getRedis() {
  if (_redis) return _redis
  const url = getRedisUrl()
  if (!url) return null
  try {
    const mod = await import('ioredis')
    const Redis = (mod && (mod.default || mod)) as any
    _redis = new Redis(url)
    _redis.on && _redis.on('error', (e: any) => { try { console.warn('[rateLimiter] redis error', e) } catch (_) {} })
    return _redis
  } catch (e) {
    try { console.warn('[rateLimiter] failed to initialize redis', e) } catch (_) {}
    return null
  }
}

function encodeKey(k: string) { return encodeURIComponent(k) }

export async function isLocked(key: string) {
  const r = await getRedis()
  if (r) {
    try {
      const lockKey = `rl:lock:${encodeKey(key)}`
      const ttl = await r.pttl(lockKey)
      if (typeof ttl === 'number' && ttl > 0) return true
    } catch (e) {
      try { console.warn('[rateLimiter] redis isLocked error', e) } catch (_) {}
    }
  }
  // DB fallback: check auth_locks table
  if (!DISABLE_DB_FALLBACK) {
    try {
      const { query } = await import('./db')
      const rows: any = await query('SELECT UNIX_TIMESTAMP(locked_until) * 1000 as locked_until_ms FROM auth_locks WHERE key_name = ? AND locked_until > NOW() LIMIT 1', [key])
      if (Array.isArray(rows) && rows.length) return true
    } catch (e) {
      try { console.warn('[rateLimiter] db isLocked check failed', e) } catch (_) {}
    }
  }
  const e = store.get(key)
  if (!e) return false
  if (e.lockedUntil && e.lockedUntil > now()) return true
  if (e.lockedUntil && e.lockedUntil <= now()) {
    store.delete(key)
    return false
  }
  return false
}

export async function incrementFailure(key: string, opts?: { windowMs?: number; max?: number; lockMs?: number; reason?: string }) {
  const windowMs = opts?.windowMs ?? getRateWindowMs()
  const max = opts?.max ?? getRateMax()
  const lockMs = opts?.lockMs ?? getRateLockMs()

  const r = await getRedis()
  if (r) {
    try {
      const countKey = `rl:count:${encodeKey(key)}`
      const lockKey = `rl:lock:${encodeKey(key)}`

      // Use a small Lua script to atomically INCR + set TTL and optionally set lock
      const lua = `
        local cnt = redis.call('INCR', KEYS[1])
        if cnt == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
        local lockTtl = redis.call('PTTL', KEYS[2])
        if tonumber(cnt) >= tonumber(ARGV[2]) then
          redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
          lockTtl = ARGV[3]
        end
        return {cnt, lockTtl}
      `
      const res = await r.eval(lua, 2, countKey, lockKey, windowMs, max, lockMs)
      const cur = Number(res && res[0] ? res[0] : 0)
      const lockTtl = Number(res && res[1] ? res[1] : -1)

      // increment a cumulative metric for total login attempts (namespaced)
      try {
        const mkey = metricKey('login_attempts_total')
        await r.incr(mkey)
        try { await r.expire(mkey, getMetricsTtlSec()) } catch (_) {}
      } catch (err) {
        try { console.warn('[rateLimiter] redis metrics incr failed', err) } catch (_) {}
      }

      // audit
      try {
        if (key.startsWith('email:') || key.startsWith('ip:')) {
          const parts = key.split(':')
          const email = parts[0] === 'email' ? parts.slice(1).join(':') : null
          const ip = parts[0] === 'ip' ? parts.slice(1).join(':') : null
          const { query } = await import('./db')
          await query('INSERT INTO login_attempts (email, ip, success, reason) VALUES (?, ?, ?, ?)', [email, ip, 0, opts?.reason || 'rate_limit'])
        }
      } catch (err) {
        try { console.warn('[rateLimiter] audit insert failed', err) } catch (_) {}
      }

      if (cur >= max) {
        const until = Date.now() + lockMs
        try {
          // ensure auth_locks record is written (best-effort)
          const { query } = await import('./db')
          await query('INSERT INTO auth_locks (key_name, locked_until, reason) VALUES (?, FROM_UNIXTIME(?/1000), ?) ON DUPLICATE KEY UPDATE locked_until = VALUES(locked_until), reason = VALUES(reason)', [key, until, opts?.reason || 'too_many_attempts'])
        } catch (err) {
          try { console.warn('[rateLimiter] auth_locks insert failed', err) } catch (_) {}
        }
        // increment lock metrics (namespaced); also set TTL
        try {
          const mTotal = metricKey('auth_locks_total')
          const mActive = metricKey('auth_locks_active')
          await r.incr(mTotal)
          try { await r.expire(mTotal, getMetricsTtlSec()) } catch (_) {}
          // track current active locks as a gauge (increment on lock)
          await r.incr(mActive)
          try { await r.expire(mActive, getMetricsTtlSec()) } catch (_) {}
        } catch (err) {
          try { console.warn('[rateLimiter] redis metrics incr failed', err) } catch (_) {}
        }
        return { locked: true, remaining: 0, lockedUntil: Date.now() + lockMs }
      }
      return { locked: false, remaining: Math.max(0, max - cur), redisTtl: lockTtl }
    } catch (err) {
      try { console.warn('[rateLimiter] redis increment error', err) } catch (_) {}
    }
  }

  // DB fallback (attempt persistent counter in DB)
  if (!DISABLE_DB_FALLBACK) {
    try {
      const { transaction } = await import('./db')
      const res = await transaction(async (conn: any) => {
      // use SELECT ... FOR UPDATE to atomically inspect and change
      const [rows] = await conn.execute('SELECT `count`, UNIX_TIMESTAMP(expires_at) * 1000 as expires_at_ms FROM rate_limiter_counts WHERE key_name = ? FOR UPDATE', [key])
      const nowMs = Date.now()
      if (!rows || rows.length === 0) {
        // insert initial counter
        await conn.execute('INSERT INTO rate_limiter_counts (key_name, `count`, expires_at) VALUES (?, ?, FROM_UNIXTIME(?/1000))', [key, 1, nowMs + windowMs])
        // audit best-effort
        try { if (key.startsWith('email:') || key.startsWith('ip:')) { const parts = key.split(':'); const email = parts[0] === 'email' ? parts.slice(1).join(':') : null; const ip = parts[0] === 'ip' ? parts.slice(1).join(':') : null; await conn.execute('INSERT INTO login_attempts (email, ip, success, reason) VALUES (?, ?, ?, ?)', [email, ip, 0, opts?.reason || 'rate_limit']) } } catch (_) {}
        return { locked: false, remaining: Math.max(0, max - 1), cur: 1 }
      }
      const row = rows[0]
      const expiresAtMs = row.expires_at_ms || 0
      if (expiresAtMs <= nowMs) {
        // reset window
        await conn.execute('UPDATE rate_limiter_counts SET `count` = 1, expires_at = FROM_UNIXTIME(?/1000) WHERE key_name = ?', [nowMs + windowMs, key])
        try { if (key.startsWith('email:') || key.startsWith('ip:')) { const parts = key.split(':'); const email = parts[0] === 'email' ? parts.slice(1).join(':') : null; const ip = parts[0] === 'ip' ? parts.slice(1).join(':') : null; await conn.execute('INSERT INTO login_attempts (email, ip, success, reason) VALUES (?, ?, ?, ?)', [email, ip, 0, opts?.reason || 'rate_limit']) } } catch (_) {}
        return { locked: false, remaining: Math.max(0, max - 1), cur: 1 }
      }
      // otherwise increment
      await conn.execute('UPDATE rate_limiter_counts SET `count` = `count` + 1 WHERE key_name = ?', [key])
      const [[updated]] = await conn.execute('SELECT `count` FROM rate_limiter_counts WHERE key_name = ?', [key])
      const cur = updated && updated.count ? Number(updated.count) : 0
      // if threshold reached, add auth_locks
      if (cur >= max) {
        const until = Date.now() + lockMs
        try {
          await conn.execute('INSERT INTO auth_locks (key_name, locked_until, reason) VALUES (?, FROM_UNIXTIME(?/1000), ?) ON DUPLICATE KEY UPDATE locked_until = VALUES(locked_until), reason = VALUES(reason)', [key, until, opts?.reason || 'too_many_attempts'])
        } catch (err) { /* best-effort */ }
        return { locked: true, remaining: 0, lockedUntil: Date.now() + lockMs, cur }
      }
      return { locked: false, remaining: Math.max(0, max - cur), cur }
    })
      if (res) {
      // attempt to increment cumulative metric in Redis if available
      try {
        const rr = await getRedis()
        if (rr) {
          const mkey = metricKey('login_attempts_total')
          await rr.incr(mkey)
          try { await rr.expire(mkey, getMetricsTtlSec()) } catch (_) {}
        }
      } catch (_) {}
      if (res.locked) return { locked: true, remaining: 0, lockedUntil: res.lockedUntil }
      return { locked: false, remaining: res.remaining }
      }
    } catch (e) {
      try { console.warn('[rateLimiter] db fallback failed', e) } catch (_) {}
    }
  }

  // fallback to in-memory
  const e = store.get(key)
  const t = now()
  if (!e) {
    store.set(key, { count: 1, firstAt: t })
    // audit best-effort
    try {
      if (key.startsWith('email:') || key.startsWith('ip:')) {
        const parts = key.split(':')
        const email = parts[0] === 'email' ? parts.slice(1).join(':') : null
        const ip = parts[0] === 'ip' ? parts.slice(1).join(':') : null
        const { query } = await import('./db')
        await query('INSERT INTO login_attempts (email, ip, success, reason) VALUES (?, ?, ?, ?)', [email, ip, 0, opts?.reason || 'rate_limit'])
      }
    } catch (err) {
      try { console.warn('[rateLimiter] audit insert failed', err) } catch (_) {}
    }
    return { locked: false, remaining: Math.max(0, max - 1) }
  }
  // if outside window, reset
  if (t - e.firstAt > windowMs) {
    e.count = 1
    e.firstAt = t
    delete e.lockedUntil
    store.set(key, e)
    return { locked: false, remaining: Math.max(0, max - 1) }
  }
  e.count += 1
  if (e.count >= max) {
    e.lockedUntil = t + lockMs
    store.set(key, e)
    try {
      const { query } = await import('./db')
      await query('INSERT INTO auth_locks (key_name, locked_until, reason) VALUES (?, FROM_UNIXTIME(?/1000), ?) ON DUPLICATE KEY UPDATE locked_until = VALUES(locked_until), reason = VALUES(reason)', [key, e.lockedUntil, opts?.reason || 'too_many_attempts'])
    } catch (err) {
      try { console.warn('[rateLimiter] auth_locks insert failed', err) } catch (_) {}
    }
    return { locked: true, remaining: 0, lockedUntil: e.lockedUntil }
  }
  store.set(key, e)
  return { locked: false, remaining: Math.max(0, max - e.count) }
}

export async function resetKey(key: string) {
  const r = await getRedis()
  if (r) {
    try {
      const countKey = `rl:count:${encodeKey(key)}`
      const lockKey = `rl:lock:${encodeKey(key)}`
      // if a lock existed, decrement the active-locks gauge
      try {
        const hadLock = await r.exists(lockKey)
        await r.del(countKey, lockKey)
        if (hadLock) {
          try { await r.decr(metricKey('auth_locks_active')) } catch (_) {}
        }
      } catch (e) {
        // best-effort: still delete keys
        try { await r.del(countKey, lockKey) } catch (_) {}
      }
      try { const { query } = await import('./db'); await query('DELETE FROM auth_locks WHERE key_name = ?', [key]) } catch (_) {}
    } catch (err) {
      try { console.warn('[rateLimiter] redis resetKey failed', err) } catch (_) {}
    }
  }
  // also remove any DB fallback counters
  if (!DISABLE_DB_FALLBACK) {
    try {
      const { query } = await import('./db')
      await query('DELETE FROM rate_limiter_counts WHERE key_name = ?', [key])
      try { await query('DELETE FROM auth_locks WHERE key_name = ?', [key]) } catch (_) {}
    } catch (_) {}
  }
  store.delete(key)
}

export async function getInfo(key: string) {
  const r = await getRedis()
  if (r) {
    try {
      const countKey = `rl:count:${encodeKey(key)}`
      const lockKey = `rl:lock:${encodeKey(key)}`
      const [countRaw, ttl] = await Promise.all([r.get(countKey), r.pttl(lockKey)])
      const count = countRaw ? Number(countRaw) : 0
      const lockedUntil = (typeof ttl === 'number' && ttl > 0) ? Date.now() + ttl : undefined
      return { count, lockedUntil }
    } catch (err) {
      try { console.warn('[rateLimiter] redis getInfo failed', err) } catch (_) {}
    }
  }
  // DB fallback: query rate_limiter_counts and auth_locks
  if (!DISABLE_DB_FALLBACK) {
    try {
      const { query } = await import('./db')
      try {
        const rows: any = await query('SELECT `count`, UNIX_TIMESTAMP(expires_at) * 1000 as expires_at_ms FROM rate_limiter_counts WHERE key_name = ? LIMIT 1', [key])
        const lockRows: any = await query('SELECT UNIX_TIMESTAMP(locked_until) * 1000 as locked_until_ms FROM auth_locks WHERE key_name = ? AND locked_until > NOW() LIMIT 1', [key])
        const count = Array.isArray(rows) && rows.length ? Number(rows[0].count || 0) : undefined
        const lockedUntil = Array.isArray(lockRows) && lockRows.length ? Number(lockRows[0].locked_until_ms) : undefined
        return { count, lockedUntil }
      } catch (e) {
        try { console.warn('[rateLimiter] db getInfo failed', e) } catch (_) {}
      }
    } catch (_) {}
  }
  return store.get(key) || null
}

export default { isLocked, incrementFailure, resetKey, getInfo }
