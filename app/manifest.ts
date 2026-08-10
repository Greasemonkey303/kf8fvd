import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KF8FVD Amateur Radio',
    short_name: 'KF8FVD',
    description: 'Station dashboard, projects, credentials, and amateur radio activity for KF8FVD.',
    start_url: '/',
    display: 'standalone',
    background_color: '#070707',
    theme_color: '#070707',
    icons: [
      { src: '/logo/mini-logo.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  }
}
