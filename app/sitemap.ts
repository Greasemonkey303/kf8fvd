import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.kf8fvd.com'
  const paths = ['/', '/aboutme', '/projects', '/projects/hotspot', '/dx', '/credentials', '/contactme', '/privacy']
  return paths.map((path) => ({
    url: new URL(path, siteUrl).toString(),
    lastModified: new Date(),
    changeFrequency: path === '/' ? 'daily' : 'monthly',
    priority: path === '/' ? 1 : 0.7,
  }))
}
