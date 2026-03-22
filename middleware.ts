import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
  const isLocalhost = /localhost|127\.0\.0\.1/.test(siteOrigin) || process.env.CSP_ALLOW_INLINE === '1'

  const scriptSrcBase = "script-src 'self' https://unpkg.com https://challenges.cloudflare.com"
  const scriptSrc = isLocalhost ? `${scriptSrcBase} 'unsafe-inline' 'unsafe-eval'` : scriptSrcBase
  const styleSrcBase = "style-src 'self' https://unpkg.com https://fonts.googleapis.com"
  const styleSrc = isLocalhost ? `${styleSrcBase} 'unsafe-inline'` : styleSrcBase

  const connectSrc = `connect-src 'self' ${siteOrigin} http://127.0.0.1:3000 http://localhost:3000 https://api.sendgrid.com https://challenges.cloudflare.com https://services.swpc.noaa.gov ws: wss:`

  const CSP = [
    "default-src 'self'",
    "base-uri 'self'",
    "block-all-mixed-content",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: https://*.gravatar.com",
    connectSrc,
    scriptSrc,
    "child-src https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    styleSrc,
    `report-uri ${siteOrigin}/api/csp/report`,
    "frame-ancestors 'none'",
  ].join('; ')

  const headerKey = (process.env.CSP_REPORT_ONLY === '1' || process.env.CSP_REPORT_ONLY === 'true') ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy'

  // Default response with CSP header set for all matched requests
  const res = NextResponse.next()
  res.headers.set(headerKey, CSP)
  // Ensure development containers receive an enforced CSP with inline
  // allowances too — some Next static prerender headers can override
  // the report-only header. For local debugging, also set the enforced
  // header so the browser allows inline styles/scripts needed for dev.
  if (isLocalhost) {
    res.headers.set('Content-Security-Policy', CSP)
  }

  const pathname = req.nextUrl.pathname

  // Skip middleware for internal assets and auth endpoints
  if (pathname.startsWith('/_next') || pathname.startsWith('/static') || pathname.startsWith('/api/auth')) {
    return res
  }

  // Only run rate-limiter and admin checks for admin routes
  if (!pathname.startsWith('/admin')) {
    return res
  }

  // Admin route: perform allowlist checks and rate limiting via server API
  try {
    const ALLOWLIST_IPS = (process.env.MW_ALLOWLIST_IPS || '').split(',').map(s => s.trim()).filter(Boolean)
    const ALLOWLIST_PATHS = (process.env.MW_ALLOWLIST_PATHS || '').split(',').map(s => s.trim()).filter(Boolean)

    const forwarded = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || ''
    const ip = (forwarded.split(',')[0] || 'unknown').trim() || 'unknown'

    if (ALLOWLIST_IPS.includes(ip)) return res

    for (const p of ALLOWLIST_PATHS) {
      if (p && pathname.startsWith(p)) return res
    }

    const rlUrl = new URL('/api/mw/rate', req.url).toString()
    const rlRes = await fetch(rlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') || '' },
      body: JSON.stringify({ ip, path: pathname }),
      cache: 'no-store'
    })
    if (!rlRes.ok) {
      if (rlRes.status === 429) {
        const j = await rlRes.json().catch(() => ({} as Record<string, unknown>))
        const retryFromBody = (typeof j === 'object' && j !== null && 'retryAfter' in j) ? String((j as Record<string, unknown>)['retryAfter']) : null
        const retry = rlRes.headers.get('Retry-After') ?? retryFromBody ?? null
        return new NextResponse('Too Many Requests', { status: 429, headers: retry ? { 'Retry-After': String(retry) } : undefined })
      }
    }
  } catch {
    // Best-effort: do not block on rate limiter failures
  }

  // Verify admin session via server-side whoami
  try {
    const whoami = new URL('/api/admin/whoami', req.url).toString()
    const whoRes = await fetch(whoami, { headers: { cookie: req.headers.get('cookie') || '' }, cache: 'no-store' })
    if (whoRes.ok) {
      const j = await whoRes.json()
      if (j && (j as Record<string, unknown>).admin) return res
    }
  } catch {
    // If the whoami check fails, fallthrough to redirect to signin.
  }

  // Not an admin — redirect to signin and preserve callback
  const signInUrl = new URL('/signin', req.url)
  signInUrl.searchParams.set('callbackUrl', req.nextUrl.pathname + req.nextUrl.search)
  return NextResponse.redirect(signInUrl)
}

export const config = {
  matcher: '/:path*',
}
