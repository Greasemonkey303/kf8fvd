import { NextResponse } from 'next/server'
import { incrementFailure } from '@/lib/rateLimiter'

type IncrementResult = {
  locked?: boolean
  remaining?: number
  lockedUntil?: number
  redisTtl?: number
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const ip = typeof body.ip === 'string' && body.ip ? body.ip : req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const path = typeof body.path === 'string' ? body.path : '/'

    const key = `ip:${ip}`

    // bump counter for this request and get status
    const res = (await incrementFailure(key, { reason: `middleware:${path}` })) as IncrementResult | null
    // if incrementFailure indicates locked, return 429
    if (res && res.locked) {
      const retryAfter = Math.ceil((res.lockedUntil || Date.now()) / 1000)
      return NextResponse.json({ allowed: false, locked: true, retryAfter }, { status: 429 })
    }

    // otherwise return remaining quota
    const remaining = (res && res.remaining) || null
    return NextResponse.json({ allowed: true, locked: false, remaining })
  } catch (err) {
    try { console.warn('[mw:rate] error', err) } catch {}
    // On error, be permissive (do not block requests due to rate limiter failures)
    return NextResponse.json({ allowed: true, locked: false, remaining: null })
  }
}
