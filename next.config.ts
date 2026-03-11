import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';

const scriptSrc = isProd
  ? "script-src 'self' https://unpkg.com https://challenges.cloudflare.com"
  : "script-src 'self' https://unpkg.com https://challenges.cloudflare.com 'unsafe-inline' 'unsafe-eval'";

const styleSrc = isProd
  ? "style-src 'self' https://unpkg.com"
  : "style-src 'self' 'unsafe-inline' https://unpkg.com";

const imgSrc = isProd
  ? "img-src 'self' data: https://*.gravatar.com https://www.google-analytics.com"
  : "img-src 'self' data: http://127.0.0.1:9000 http://localhost:9000 https://*.gravatar.com https://www.google-analytics.com";

const connectSrc = isProd
  ? `connect-src 'self' ${siteOrigin} https://api.sendgrid.com https://challenges.cloudflare.com https://services.swpc.noaa.gov`
  : `connect-src 'self' ${siteOrigin} http://127.0.0.1:9000 https://api.sendgrid.com https://challenges.cloudflare.com https://services.swpc.noaa.gov ws: wss:`;

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "block-all-mixed-content",
  "font-src 'self' https://fonts.gstatic.com data:",
  imgSrc,
  connectSrc,
  scriptSrc,
  styleSrc,
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // apply these headers to all routes
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
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
