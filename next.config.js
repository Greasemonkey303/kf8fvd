/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {},
  images: {
    // Allow Next.js to serve modern image formats when possible
    formats: ['image/avif', 'image/webp'],
    // Use `remotePatterns` for allowed external image sources (preferred over `domains`)
    // Allow local MinIO / signed URLs used during development
    remotePatterns: [
      { protocol: 'http', hostname: '127.0.0.1', port: '9000', pathname: '/:path*' },
      { protocol: 'http', hostname: 'localhost', port: '9000', pathname: '/:path*' },
      { protocol: 'http', hostname: '192.168.1.240', port: '9000', pathname: '/:path*' },
      { protocol: 'http', hostname: 'minio', port: '', pathname: '/:path*' },
      { protocol: 'https', hostname: 's3.amazonaws.com', port: '', pathname: '/:path*' }
    ]
  }
  ,
  async headers() {
    const scriptSrc = "'self' 'unsafe-inline' 'unsafe-eval'"
    const styleSrc = "'self' 'unsafe-inline'"
    const imgSrc = "'self' data: http: https:"
    const connectSrc = "'self' http://127.0.0.1:9000 https://api.sendgrid.com ws: wss:"
    const csp = `default-src 'self'; script-src ${scriptSrc}; style-src ${styleSrc}; img-src ${imgSrc}; connect-src ${connectSrc};`
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
          { key: 'X-XSS-Protection', value: '0' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Content-Security-Policy', value: csp }
        ]
      }
    ]
  }
}
module.exports = nextConfig
