import type { NextConfig } from 'next'

const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingIncludes: {
    '/*': [
      './node_modules/mysql2/**/*',
      './node_modules/minio/**/*',
      './node_modules/ioredis/**/*',
      './node_modules/@aws-sdk/**/*',
    ],
  },
  experimental: {
    proxyClientMaxBodySize: '60mb',
  },
  async headers() {
    const headersList = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
      { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
      { key: 'X-XSS-Protection', value: '0' },
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

export default nextConfig
