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

export function isLocked(key: string) {
  const e = store.get(key)
  if (!e) return false
  if (e.lockedUntil && e.lockedUntil > now()) return true
  if (e.lockedUntil && e.lockedUntil <= now()) {
    store.delete(key)
    return false
  }
  return false
}

export function incrementFailure(key: string, opts?: { windowMs?: number; max?: number; lockMs?: number }) {
  const windowMs = opts?.windowMs ?? DEFAULT_WINDOW
  const max = opts?.max ?? DEFAULT_MAX
  const lockMs = opts?.lockMs ?? DEFAULT_LOCK_MS
  const e = store.get(key)
  const t = now()
  if (!e) {
    store.set(key, { count: 1, firstAt: t })
    return { locked: false, remaining: max - 1 }
  }
  // if outside window, reset
  if (t - e.firstAt > windowMs) {
    e.count = 1
    e.firstAt = t
    delete e.lockedUntil
    store.set(key, e)
    return { locked: false, remaining: max - 1 }
  }
  e.count += 1
  if (e.count > max) {
    e.lockedUntil = t + lockMs
    store.set(key, e)
    return { locked: true, remaining: 0, lockedUntil: e.lockedUntil }
  }
  store.set(key, e)
  return { locked: false, remaining: Math.max(0, max - e.count) }
}

export function resetKey(key: string) { store.delete(key) }

export function getInfo(key: string) { return store.get(key) }

export default { isLocked, incrementFailure, resetKey, getInfo }
