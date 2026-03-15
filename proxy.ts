import { NextRequest, NextResponse } from 'next/server'

// Allowlist configuration (comma-separated env vars)
const ALLOWLIST_IPS = (process.env.MW_ALLOWLIST_IPS || '').split(',').map(s => s.trim()).filter(Boolean)
const ALLOWLIST_PATHS = (process.env.MW_ALLOWLIST_PATHS || '').split(',').map(s => s.trim()).filter(Boolean)

export default async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname

  // Safety allowlist: skip middleware for internal assets and auth endpoints
  if (pathname.startsWith('/_next') || pathname.startsWith('/static') || pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  // Allowlist checks: if IP or path are allowlisted, skip rate limiting
  try {
    const forwarded = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || ''
    const ip = (forwarded.split(',')[0] || 'unknown').trim() || 'unknown'
    // If IP is allowlisted, skip rate limit
    if (ALLOWLIST_IPS.includes(ip)) return NextResponse.next()
    // If path matches any allowlisted path prefix, skip
    for (const p of ALLOWLIST_PATHS) {
      if (p && pathname.startsWith(p)) return NextResponse.next()
    }

    // Call server-side rate limiter API (uses Redis in production)
    const rlUrl = new URL('/api/mw/rate', req.url).toString()
    const rlRes = await fetch(rlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') || '' },
      body: JSON.stringify({ ip, path: pathname }),
      cache: 'no-store'
    })
    if (!rlRes.ok) {
      if (rlRes.status === 429) {
        // Respect Retry-After header if present
        const j = await rlRes.json().catch(() => ({})) as any
        const retry = rlRes.headers.get('Retry-After') || j?.retryAfter || null
        return new NextResponse('Too Many Requests', { status: 429, headers: retry ? { 'Retry-After': String(retry) } : undefined })
      }
    }
  } catch (e) {
    // Best-effort: do not block on rate limiter failures
  }

  // Only protect admin UI routes; matcher is configured below to limit middleware runs.
  // Ask the server who the current user is (server-side session verification).
  try {
    const whoami = new URL('/api/admin/whoami', req.url).toString()
    const res = await fetch(whoami, { headers: { cookie: req.headers.get('cookie') || '' }, cache: 'no-store' })
    if (res.ok) {
      const j = await res.json()
      if (j && j.admin) return NextResponse.next()
    }
  } catch (e) {
    // If the whoami check fails, fallthrough to redirect to signin.
  }

  // Not an admin — redirect to signin and preserve callback
  const signInUrl = new URL('/signin', req.url)
  signInUrl.searchParams.set('callbackUrl', req.nextUrl.pathname + req.nextUrl.search)
  return NextResponse.redirect(signInUrl)
}

export const config = {
  matcher: ['/admin/:path*']
}
