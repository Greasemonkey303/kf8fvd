/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'

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

    // In production, avoid unsafe-inline/eval and limit connect-src to secure endpoints
    const scriptSrc = isProd ? "'self'" : "'self' 'unsafe-inline' 'unsafe-eval'"
    const styleSrc = isProd ? "'self'" : "'self' 'unsafe-inline'"
    const imgSrc = isProd ? "'self' data: https:" : "'self' data: http: https:"
    const connectSrc = isProd
      ? `'self' ${siteOrigin} https://api.sendgrid.com`
      : `'self' ${siteOrigin} http://127.0.0.1:9000 https://api.sendgrid.com ws: wss:`

    const csp = `default-src 'self'; script-src ${scriptSrc}; style-src ${styleSrc}; img-src ${imgSrc}; connect-src ${connectSrc};`

    const headers = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
      { key: 'X-XSS-Protection', value: '0' },
      { key: 'Content-Security-Policy', value: csp }
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
