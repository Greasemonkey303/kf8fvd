import { NextResponse } from 'next/server'
import { incrementFailure } from '@/lib/rateLimiter'

type IncrementResult = {
  locked?: boolean
  remaining?: number
  lockedUntil?: number
  redisTtl?: number
}

function toNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const ip = typeof body.ip === 'string' && body.ip ? body.ip : req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const path = typeof body.path === 'string' ? body.path : '/'
    const scope = typeof body.scope === 'string' ? body.scope : 'default'
    const key = typeof body.key === 'string' && body.key ? body.key : `ip:${ip}`

    const opts = scope === 'admin'
      ? {
          windowMs: toNumber(process.env.ADMIN_RATE_WINDOW_MS, 5 * 60 * 1000),
          max: toNumber(process.env.ADMIN_RATE_MAX, 10),
          lockMs: toNumber(process.env.ADMIN_RATE_LOCK_MS, 10 * 60 * 1000),
          reason: `admin_middleware:${path}`,
        }
      : {
          reason: `middleware:${path}`,
        }

    // bump counter for this request and get status
    const res = (await incrementFailure(key, opts)) as IncrementResult | null
    // if incrementFailure indicates locked, return 429
    if (res && res.locked) {
      const retryAfter = Math.ceil((res.lockedUntil || Date.now()) / 1000)
      return NextResponse.json({ allowed: false, locked: true, retryAfter, scope }, { status: 429 })
    }

    // otherwise return remaining quota
    const remaining = (res && res.remaining) || null
    return NextResponse.json({ allowed: true, locked: false, remaining, scope })
  } catch (err) {
    try { console.warn('[mw:rate] error', err) } catch {}
    // On error, be permissive (do not block requests due to rate limiter failures)
    return NextResponse.json({ allowed: true, locked: false, remaining: null })
  }
}
