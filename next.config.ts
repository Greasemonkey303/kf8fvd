import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';

const scriptSrc = isProd
  ? "script-src 'self' https://unpkg.com https://challenges.cloudflare.com"
  : "script-src 'self' https://unpkg.com https://challenges.cloudflare.com 'unsafe-inline' 'unsafe-eval'";

const styleSrc = isProd
  ? "style-src 'self' https://unpkg.com https://fonts.googleapis.com"
  : "style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com";

const imgSrc = isProd
  ? "img-src 'self' data: https://*.gravatar.com https://www.google-analytics.com"
  : "img-src 'self' data: http://127.0.0.1:9000 http://localhost:9000 https://*.gravatar.com https://www.google-analytics.com";

// Ensure localhost:3030 is explicitly allowed for development and local testing
const localDev3030 = "http://127.0.0.1:3030 http://localhost:3030";
const connectSrc = isProd
  ? `connect-src 'self' ${siteOrigin} ${localDev3030} https://api.sendgrid.com https://challenges.cloudflare.com https://services.swpc.noaa.gov`
  : `connect-src 'self' ${siteOrigin} ${localDev3030} http://127.0.0.1:9000 https://api.sendgrid.com https://challenges.cloudflare.com https://services.swpc.noaa.gov ws: wss:`;

const reportUri = `${siteOrigin}/api/csp/report`

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "block-all-mixed-content",
  "font-src 'self' https://fonts.gstatic.com data:",
  imgSrc,
  connectSrc,
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
  async headers() {
    return [
      {
        // apply these headers to all routes
        source: '/(.*)',
        headers: [
          { key: cspHeaderKey, value: CSP },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
        ],
      },
    ];
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    // Also allow specific hostnames as image domains (fallback for dev)
    domains: ['127.0.0.1', 'localhost', 'minio', 's3.amazonaws.com'],
    remotePatterns: [
      { protocol: 'http', hostname: '127.0.0.1', port: '9000', pathname: '/:path*' },
      { protocol: 'http', hostname: 'localhost', port: '9000', pathname: '/:path*' },
      { protocol: 'http', hostname: 'minio', port: '', pathname: '/:path*' },
      { protocol: 'https', hostname: 's3.amazonaws.com', port: '', pathname: '/:path*' }
    ]
  },
};

export default nextConfig;
