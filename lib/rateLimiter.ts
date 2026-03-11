type Entry = {
  count: number
  firstAt: number
  lockedUntil?: number
}

const store = new Map<string, Entry>()

const DEFAULT_WINDOW = Number(process.env.RATE_WINDOW_MS || 15 * 60 * 1000)
const DEFAULT_MAX = Number(process.env.RATE_MAX || 5)
const DEFAULT_LOCK_MS = Number(process.env.RATE_LOCK_MS || 15 * 60 * 1000)

function now() { return Date.now() }

let _redis: any | null = null
async function getRedis() {
  if (_redis) return _redis
  const url = process.env.REDIS_URL || (process.env.REDIS_HOST ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}` : '')
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
  const windowMs = opts?.windowMs ?? DEFAULT_WINDOW
  const max = opts?.max ?? DEFAULT_MAX
  const lockMs = opts?.lockMs ?? DEFAULT_LOCK_MS

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
        return { locked: true, remaining: 0, lockedUntil: Date.now() + lockMs }
      }
      return { locked: false, remaining: Math.max(0, max - cur), redisTtl: lockTtl }
    } catch (err) {
      try { console.warn('[rateLimiter] redis increment error', err) } catch (_) {}
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
      await r.del(countKey, lockKey)
      try { const { query } = await import('./db'); await query('DELETE FROM auth_locks WHERE key_name = ?', [key]) } catch (_) {}
    } catch (err) {
      try { console.warn('[rateLimiter] redis resetKey failed', err) } catch (_) {}
    }
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
  return store.get(key) || null
}

export default { isLocked, incrementFailure, resetKey, getInfo }
