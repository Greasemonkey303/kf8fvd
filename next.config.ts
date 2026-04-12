import type { NextConfig } from "next";

const experimentalConfig: NonNullable<NextConfig['experimental']> = {
  proxyClientMaxBodySize: '60mb',
}

const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';

function getAllowedOrigins(...values: Array<string | undefined>) {
  return Array.from(new Set(values
    .filter(Boolean)
    .map((value) => {
      try {
        return new URL(value as string).origin
      } catch {
        return null
      }
    })
    .filter((value): value is string => Boolean(value))))
}

const umamiOrigins = getAllowedOrigins(
  process.env.NEXT_PUBLIC_UMAMI_HOST_URL,
  process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL,
)
const extraScriptOrigins = umamiOrigins.length ? ` ${umamiOrigins.join(' ')}` : ''
const extraConnectOrigins = umamiOrigins.length ? ` ${umamiOrigins.join(' ')}` : ''

// Allow inline styles/scripts when running locally (developer convenience).
// This keeps production CSP strict while making local prod-like runs usable.
const isLocalhost = /localhost|127\.0\.0\.1/.test(siteOrigin) || process.env.CSP_ALLOW_INLINE === '1';

const scriptSrcBase = `script-src 'self' https://unpkg.com https://challenges.cloudflare.com${extraScriptOrigins}`;
// During local debugging we allow inline scripts so Next's client runtime
// hydration and small injected scripts aren't blocked by CSP. Remove this
// allowance in production when hardening for deployment.
const scriptSrc = isLocalhost ? `${scriptSrcBase} 'unsafe-inline' 'unsafe-eval'` : `${scriptSrcBase}`;

const styleSrcBase = "style-src 'self' https://unpkg.com https://fonts.googleapis.com";
// Same for styles: many components and server-side rendering emit
// inline style attributes during hydration; allow them locally.
const styleSrc = isLocalhost ? `${styleSrcBase} 'unsafe-inline'` : `${styleSrcBase}`;

const imgSrc = isProd
  ? "img-src 'self' data: https://*.gravatar.com https://www.google-analytics.com"
  : "img-src 'self' data: http://127.0.0.1:9000 http://localhost:9000 https://*.gravatar.com https://www.google-analytics.com";

// Ensure localhost:3000 is explicitly allowed for development and local testing
const localDev3000 = "http://127.0.0.1:3000 http://localhost:3000";
const connectSrc = isProd
  ? `connect-src 'self' ${siteOrigin} ${localDev3000}${extraConnectOrigins} https://api.sendgrid.com https://challenges.cloudflare.com https://services.swpc.noaa.gov https://unpkg.com`
  : `connect-src 'self' ${siteOrigin} ${localDev3000}${extraConnectOrigins} http://127.0.0.1:9000 https://api.sendgrid.com https://challenges.cloudflare.com https://services.swpc.noaa.gov https://unpkg.com ws: wss:`;

const reportUri = `${siteOrigin}/api/csp/report`

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "block-all-mixed-content",
  "font-src 'self' https://fonts.gstatic.com data:",
  imgSrc,
  connectSrc,
    // Allow inline scripts/styles in local/dev for debugging. Remove in production.
    scriptSrc,
  // Allow Turnstile iframe origin so the widget can render
  // Include both `child-src` and `frame-src` to cover different browser implementations
  "child-src https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
    styleSrc,
  `report-uri ${reportUri}`,
  "frame-ancestors 'none'",
].join('; ');

const cspHeaderKey = (process.env.CSP_REPORT_ONLY === '1' || process.env.CSP_REPORT_ONLY === 'true') ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy'

const nextConfig: NextConfig = {
  experimental: experimentalConfig,
  async headers() {
    // Set CSP header here for now (includes 'unsafe-inline' for local debugging).
    const headersList = [
      { key: cspHeaderKey, value: CSP },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
      { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
    ];

    if (isProd) {
      headersList.push({ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' })
    }

    return [
      {
        source: '/(.*)',
        headers: headersList,
      },
    ];
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    // Also allow specific hostnames as image domains (fallback for dev)
    domains: ['127.0.0.1', 'localhost', 'minio', 's3.amazonaws.com'],
    // Allow Next's image optimizer to fetch images served by the local API
    // which uses query-based URLs like `/api/uploads/get?key=...`.
    localPatterns: [
      { pathname: '/api/uploads/get' }
    ],
    remotePatterns: [
      { protocol: 'http', hostname: '127.0.0.1', port: '9000', pathname: '/:path*' },
      { protocol: 'http', hostname: '192.168.1.240', port: '9000', pathname: '/:path*' },
      { protocol: 'http', hostname: 'localhost', port: '9000', pathname: '/:path*' },
      { protocol: 'http', hostname: 'minio', port: '', pathname: '/:path*' },
      { protocol: 'https', hostname: 's3.amazonaws.com', port: '', pathname: '/:path*' }
    ]
  },
};

export default nextConfig;
