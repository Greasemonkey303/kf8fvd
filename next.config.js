/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {},
  images: {
    // Allow Next.js to serve modern image formats when possible
    formats: ['image/avif', 'image/webp']
  }
}
module.exports = nextConfig
