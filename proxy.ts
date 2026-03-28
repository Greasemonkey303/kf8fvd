import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function proxy(req: NextRequest) {
  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
  const internalAppOrigin = process.env.INTERNAL_APP_ORIGIN || `http://127.0.0.1:${process.env.PORT || '3000'}`
  const isLocalhost = /localhost|127\.0\.0\.1/.test(siteOrigin) || process.env.CSP_ALLOW_INLINE === '1'
  const pathname = req.nextUrl.pathname
  const allowAdminInlineStyles = pathname.startsWith('/admin')

  // Generate a per-request CSP nonce for production. Keep this lightweight
  // to avoid adding heavy crypto dependencies in the proxy runtime.
  const makeNonce = () => {
    try {
      // Prefer web crypto if available
      if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const arr = new Uint8Array(16)
        crypto.getRandomValues(arr)
        return Array.from(arr).map(b => ('0' + b.toString(16)).slice(-2)).join('')
      }
    } catch {
      // fallthrough
    }
    return (Math.random().toString(36).slice(2) + Date.now().toString(36))
  }
  const nonce = isLocalhost ? '' : makeNonce()

  const scriptSrcBase = "script-src 'self' https://unpkg.com https://challenges.cloudflare.com"
  // In production prefer nonces; in local/dev keep 'unsafe-inline' for developer convenience
  const scriptSrc = isLocalhost ? `${scriptSrcBase} 'unsafe-inline' 'unsafe-eval'` : `${scriptSrcBase} 'nonce-${nonce}'`
  const styleSrcBase = "style-src 'self' https://unpkg.com https://fonts.googleapis.com"
  const styleSrc = (isLocalhost || allowAdminInlineStyles) ? `${styleSrcBase} 'unsafe-inline'` : `${styleSrcBase} 'nonce-${nonce}'`

  const connectSrc = `connect-src 'self' ${siteOrigin} http://127.0.0.1:3000 http://localhost:3000 https://api.sendgrid.com https://challenges.cloudflare.com https://services.swpc.noaa.gov https://unpkg.com ws: wss:`

  const CSP = [
    "default-src 'self'",
    "base-uri 'self'",
    'block-all-mixed-content',
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: https://*.gravatar.com",
    connectSrc,
    scriptSrc,
    'child-src https://challenges.cloudflare.com',
    'frame-src https://challenges.cloudflare.com',
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
  // Always expose the per-request nonce via a cookie so server components can
  // consume it and apply `nonce` attributes. In production the cookie is marked
  // `Secure` as well. Localhost/dev will receive the cookie without `Secure`.
  if (!isLocalhost) {
    const cookieOptions = ['Path=/', 'SameSite=Lax', 'HttpOnly', 'Max-Age=300']
    if (process.env.NODE_ENV === 'production') cookieOptions.push('Secure')
    res.headers.append('Set-Cookie', `csp-nonce=${nonce}; ${cookieOptions.join('; ')}`)
  }
  if (isLocalhost) {
    res.headers.set('Content-Security-Policy', CSP)
  }

  // Skip proxy for internal assets and auth endpoints
  if (pathname.startsWith('/_next') || pathname.startsWith('/static') || pathname.startsWith('/api/auth')) {
    return res
  }

  // Only run rate-limiter and admin checks for admin routes
  if (!pathname.startsWith('/admin')) {
    return res
  }

  const forwarded = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || ''
  const ip = (forwarded.split(',')[0] || 'unknown').trim() || 'unknown'

  // Admin route: perform allowlist checks and rate limiting via server API
  try {
    const ALLOWLIST_IPS = (process.env.MW_ALLOWLIST_IPS || '').split(',').map(s => s.trim()).filter(Boolean)
    const ALLOWLIST_PATHS = (process.env.MW_ALLOWLIST_PATHS || '').split(',').map(s => s.trim()).filter(Boolean)

    if (ALLOWLIST_IPS.includes(ip)) return res

    for (const p of ALLOWLIST_PATHS) {
      if (p && pathname.startsWith(p)) return res
    }
  } catch {
    // Best-effort: do not block on rate limiter failures
  }

  // Verify admin session via server-side whoami
  try {
    const whoami = new URL('/api/admin/whoami', internalAppOrigin).toString()
    const whoRes = await fetch(whoami, { headers: { cookie: req.headers.get('cookie') || '' }, cache: 'no-store' })
    if (whoRes.ok) {
      const j = await whoRes.json()
      if (j && (j as Record<string, unknown>).admin) return res
    }
  } catch {
    // If the whoami check fails, fallthrough to redirect to signin.
  }

  // Only rate-limit failed admin access attempts so authenticated admins are
  // not penalized for normal page navigation. This keeps the admin gate and
  // Turnstile-protected sign-in flow active at the same time.
  try {
    const rateUrl = new URL('/api/mw/rate', internalAppOrigin).toString()
    const rateRes = await fetch(rateUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': ip,
      },
      body: JSON.stringify({
        ip,
        path: pathname,
        scope: 'admin',
        key: `admin-ip:${ip}`,
      }),
      cache: 'no-store',
    })
    if (rateRes.status === 429) {
      const retryAfter = rateRes.headers.get('retry-after')
      const lockRes = NextResponse.json({ error: 'Too many admin access attempts, try again later.' }, { status: 429 })
      if (retryAfter) lockRes.headers.set('Retry-After', retryAfter)
      return lockRes
    }
  } catch {
    // Best-effort: do not block on rate limiter failures
  }

  // Not an admin — redirect to signin and preserve callback
  const signInUrl = new URL('/signin', req.url)
  signInUrl.searchParams.set('callbackUrl', req.nextUrl.pathname + req.nextUrl.search)
  const redirectRes = NextResponse.redirect(signInUrl)
  redirectRes.cookies.set('__Secure-next-auth.session-token', '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 0,
  })
  redirectRes.cookies.set('next-auth.session-token', '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return redirectRes
}

export const config = {
  matcher: '/:path*',
}