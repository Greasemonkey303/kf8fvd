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
      { protocol: 'http', hostname: 'minio', port: '', pathname: '/:path*' },
      { protocol: 'https', hostname: 's3.amazonaws.com', port: '', pathname: '/:path*' }
    ]
  }
}
module.exports = nextConfig
