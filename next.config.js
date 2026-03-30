/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'

function getAllowedOrigins(...values) {
  return Array.from(new Set(values
    .filter(Boolean)
    .map(value => {
      try {
        return new URL(value).origin
      } catch {
        return null
      }
    })
    .filter(Boolean)))
}

const nextConfig = {
  experimental: {},
  images: {
    // Allow Next.js to serve modern image formats when possible
    formats: ['image/avif', 'image/webp'],
    // Use `remotePatterns` for allowed external image sources (preferred over `domains`)
    remotePatterns: [
      // local dev MinIO
      { protocol: 'http', hostname: '127.0.0.1', port: '9000', pathname: '/:path*' },
      { protocol: 'http', hostname: 'localhost', port: '9000', pathname: '/:path*' },
      { protocol: 'http', hostname: '192.168.1.240', port: '9000', pathname: '/:path*' },
      { protocol: 'http', hostname: 'minio', port: '', pathname: '/:path*' },
      { protocol: 'https', hostname: 's3.amazonaws.com', port: '', pathname: '/:path*' }
    ]
  },

  async headers() {
    const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const umamiOrigins = getAllowedOrigins(process.env.NEXT_PUBLIC_UMAMI_HOST_URL, process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL)
    const extraScriptOrigins = umamiOrigins.length ? ` ${umamiOrigins.join(' ')}` : ''
    const extraConnectOrigins = umamiOrigins.length ? ` ${umamiOrigins.join(' ')}` : ''

    // For local debugging allow inline scripts/styles so Next's inline
    // hydration/runtime scripts and server-emitted style attributes aren't blocked.
    // Only include 'unsafe-inline' when running locally or when explicitly
    // allowed via `CSP_ALLOW_INLINE=1` to keep production CSP strict.
    const allowInline = /localhost|127\.0\.0\.1/.test(siteOrigin) || process.env.CSP_ALLOW_INLINE === '1'
    const scriptSrc = allowInline ? `script-src 'self' https://unpkg.com https://challenges.cloudflare.com${extraScriptOrigins} 'unsafe-inline' 'unsafe-eval'` : `script-src 'self' https://unpkg.com https://challenges.cloudflare.com${extraScriptOrigins}`
    const styleSrc = allowInline ? "style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com" : "style-src 'self' https://unpkg.com https://fonts.googleapis.com"
    const imgSrc = isProd ? "img-src 'self' data: https: https://*.gravatar.com" : "img-src 'self' data: http: https: https://*.gravatar.com"
    // Ensure localhost:3000 is explicitly allowed for development and local testing
    const localDev3000 = "http://127.0.0.1:3000 http://localhost:3000"
    const connectSrc = isProd
      ? `connect-src 'self' ${siteOrigin} ${localDev3000}${extraConnectOrigins} https://api.sendgrid.com https://challenges.cloudflare.com https://services.swpc.noaa.gov`
      : `connect-src 'self' ${siteOrigin} ${localDev3000}${extraConnectOrigins} http://127.0.0.1:9000 https://api.sendgrid.com https://challenges.cloudflare.com https://services.swpc.noaa.gov ws: wss:`
    const fontSrc = "font-src 'self' https://fonts.gstatic.com data:"
    const reportUri = `${siteOrigin}/api/csp/report`
    // Explicitly allow Cloudflare Turnstile frames
    const csp = `default-src 'self'; base-uri 'self'; block-all-mixed-content; ${fontSrc}; ${imgSrc}; ${connectSrc}; ${scriptSrc}; child-src https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; ${styleSrc}; report-uri ${reportUri}; frame-ancestors 'none'`

    const cspHeaderKey = (process.env.CSP_REPORT_ONLY === '1' || process.env.CSP_REPORT_ONLY === 'true') ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy'

    // For local Docker builds the static header is easier to reason about
    // and ensures the browser receives the intended policy. This includes
    // temporary 'unsafe-inline' allowances for development only — remove
    // before production deploy.
    const headers = [
      { key: cspHeaderKey, value: csp },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
      { key: 'X-XSS-Protection', value: '0' },
    ]

    if (isProd) {
      headers.push({ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' })
    }

    return [
      {
        source: '/(.*)',
        headers
      }
    ]
  }
}

module.exports = nextConfig
