import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RunnitBack Command Center',
    short_name: 'RunnitBack',
    description: 'Unified internal workflow for review, publishing, analytics, and source ingestion.',
    start_url: '/login',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  }
}
