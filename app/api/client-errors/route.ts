import { NextResponse } from 'next/server'
import { getRedis } from '@/lib/rateLimiter'
import { logRouteError, logRouteEvent } from '@/lib/observability'

type ClientErrorReport = {
  type?: string
  message?: string
  stack?: string | null
  url?: string | null
  source?: string | null
  status?: number | null
  method?: string | null
  route?: string | null
  count?: number
  href?: string | null
  userAgent?: string | null
  timestamp?: string | null
}

type MemoryLimitEntry = {
  count: number
  resetAt: number
  lockedUntil?: number
}

const ALLOWED_REPORT_TYPES = new Set(['window-error', 'unhandled-rejection', 'fetch-error'])
const memoryRateState = new Map<string, MemoryLimitEntry>()
const seenSignatures = new Map<string, number>()
const textDecoder = new TextDecoder()

function numEnv(name: string, fallback: number) {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function getMaxPayloadBytes() {
  return numEnv('CLIENT_ERROR_MAX_BYTES', 8 * 1024)
}

function getRateWindowMs() {
  return numEnv('CLIENT_ERROR_RATE_WINDOW_MS', 60_000)
}

function getRateMax() {
  return numEnv('CLIENT_ERROR_RATE_MAX', 40)
}

function getRateLockMs() {
  return numEnv('CLIENT_ERROR_RATE_LOCK_MS', 5 * 60_000)
}

function getDedupeWindowMs() {
  return numEnv('CLIENT_ERROR_DEDUPE_WINDOW_MS', 30_000)
}

function normalizeIp(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || ''
  const first = forwarded.split(',')[0]?.trim() || 'unknown'
  return sanitize(first, 120) || 'unknown'
}

function makeRateKey(ip: string) {
  return `client-errors:${encodeURIComponent(ip)}`
}

function pruneSeenSignatures(now: number) {
  const dedupeWindowMs = getDedupeWindowMs()
  for (const [signature, seenAt] of seenSignatures.entries()) {
    if (now - seenAt > dedupeWindowMs) {
      seenSignatures.delete(signature)
    }
  }
}

function pruneMemoryRateState(now: number) {
  for (const [key, entry] of memoryRateState.entries()) {
    const lockExpired = !entry.lockedUntil || entry.lockedUntil <= now
    if (entry.resetAt <= now && lockExpired) {
      memoryRateState.delete(key)
      continue
    }
    if (entry.lockedUntil && entry.lockedUntil <= now) {
      delete entry.lockedUntil
      if (entry.resetAt <= now) memoryRateState.delete(key)
      else memoryRateState.set(key, entry)
    }
  }
}

function chunkByteLength(chunk: unknown) {
  if (chunk instanceof Uint8Array) return chunk.byteLength
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(chunk)) return chunk.byteLength
  if (chunk instanceof ArrayBuffer) return chunk.byteLength
  return Buffer.byteLength(String(chunk), 'utf8')
}

async function readRequestTextWithinLimit(req: Request, maxBytes: number) {
  if (!req.body) return { overLimit: false, text: '' }

  const bodyStream = req.body as ReadableStream<Uint8Array>
  if (typeof bodyStream.getReader !== 'function') {
    const fallbackText = await req.text()
    return {
      overLimit: Buffer.byteLength(fallbackText, 'utf8') > maxBytes,
      text: fallbackText,
    }
  }

  const reader = bodyStream.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += chunkByteLength(value)
      if (totalBytes > maxBytes) {
        await reader.cancel()
        return { overLimit: true, text: '' }
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const merged = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }

  return {
    overLimit: false,
    text: textDecoder.decode(merged),
  }
}

async function incrementClientErrorRate(key: string) {
  const windowMs = getRateWindowMs()
  const max = getRateMax()
  const lockMs = getRateLockMs()
  const redis = await getRedis()

  if (redis && typeof redis.eval === 'function') {
    const countKey = `${key}:count`
    const lockKey = `${key}:lock`
    const lua = `
      local lockedTtl = redis.call('PTTL', KEYS[2])
      if lockedTtl > 0 then
        return {-1, lockedTtl}
      end
      local cnt = redis.call('INCR', KEYS[1])
      if cnt == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
      if tonumber(cnt) > tonumber(ARGV[2]) then
        redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
        lockedTtl = tonumber(ARGV[3])
        return {cnt, lockedTtl}
      end
      local ttl = redis.call('PTTL', KEYS[1])
      return {cnt, ttl}
    `
    const result = await redis.eval(lua, 2, countKey, lockKey, windowMs, max, lockMs)
    const values = Array.isArray(result) ? result : []
    const count = Number(values[0] ?? 0)
    const ttlMs = Number(values[1] ?? windowMs)
    return {
      limited: count === -1 || count > max,
      retryAfterMs: ttlMs > 0 ? ttlMs : lockMs,
    }
  }

  const now = Date.now()
  pruneMemoryRateState(now)
  const existing = memoryRateState.get(key)
  if (!existing || existing.resetAt <= now) {
    memoryRateState.set(key, { count: 1, resetAt: now + windowMs })
    return { limited: false, retryAfterMs: windowMs }
  }

  if (existing.lockedUntil && existing.lockedUntil > now) {
    return { limited: true, retryAfterMs: existing.lockedUntil - now }
  }

  existing.count += 1
  if (existing.count > max) {
    existing.lockedUntil = now + lockMs
    memoryRateState.set(key, existing)
    return { limited: true, retryAfterMs: lockMs }
  }

  memoryRateState.set(key, existing)
  return { limited: false, retryAfterMs: Math.max(0, existing.resetAt - now) }
}

function sanitize(value: unknown, max = 2000) {
  if (value == null) return null
  const text = String(value)
  return text.length > max ? text.slice(0, max) : text
}

export async function POST(req: Request) {
  try {
    const ip = normalizeIp(req)
    const announcedLength = Number(req.headers.get('content-length') || '0')
    if (Number.isFinite(announcedLength) && announcedLength > getMaxPayloadBytes()) {
      logRouteEvent('warn', { route: 'api/client-errors', action: 'client_error_rejected', reason: 'payload_too_large', ip })
      return NextResponse.json({ error: 'Client error payload too large' }, { status: 413 })
    }

    const rate = await incrementClientErrorRate(makeRateKey(ip))
    if (rate.limited) {
      logRouteEvent('warn', { route: 'api/client-errors', action: 'client_error_rate_limited', reason: 'too_many_reports', ip })
      return NextResponse.json(
        { error: 'Too many client error reports' },
        { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(rate.retryAfterMs / 1000))) } },
      )
    }

    const { overLimit, text } = await readRequestTextWithinLimit(req, getMaxPayloadBytes())
    if (overLimit) {
      logRouteEvent('warn', { route: 'api/client-errors', action: 'client_error_rejected', reason: 'payload_too_large_runtime', ip })
      return NextResponse.json({ error: 'Client error payload too large' }, { status: 413 })
    }

    const body = JSON.parse(text) as ClientErrorReport
    const report = {
      type: sanitize(body.type, 80),
      message: sanitize(body.message, 800),
      stack: sanitize(body.stack, 2000),
      url: sanitize(body.url, 1000),
      source: sanitize(body.source, 1000),
      status: typeof body.status === 'number' ? body.status : null,
      method: sanitize(body.method, 16),
      route: sanitize(body.route, 500),
      count: typeof body.count === 'number' ? Math.max(1, Math.min(100, Math.trunc(body.count))) : 1,
      href: sanitize(body.href, 1000),
      userAgent: sanitize(body.userAgent, 500),
      timestamp: sanitize(body.timestamp, 80),
      ip,
    }

    if (!report.type || !report.message || !ALLOWED_REPORT_TYPES.has(report.type)) {
      return NextResponse.json({ error: 'Invalid client error report' }, { status: 400 })
    }

    const now = Date.now()
    pruneSeenSignatures(now)
    const signature = JSON.stringify([report.ip, report.type, report.message, report.route, report.url, report.status, report.source])
    const seenAt = seenSignatures.get(signature)
    if (seenAt && now - seenAt <= getDedupeWindowMs()) {
      return NextResponse.json({ ok: true, deduped: true }, { status: 202 })
    }
    seenSignatures.set(signature, now)

    logRouteEvent('error', { route: 'api/client-errors', action: 'client_error_received', reason: report.type, status: report.status, method: report.method, resourceId: report.route || report.url || null, ip: report.ip, count: report.count, href: report.href, source: report.source, message: report.message })
    return NextResponse.json({ ok: true }, { status: 202 })
  } catch (error) {
    logRouteError('api/client-errors', error, { action: 'client_error_payload_failed', reason: 'invalid_payload' })
    return NextResponse.json({ error: 'Invalid client error payload' }, { status: 400 })
  }
}