import type { Metadata, Viewport } from 'next'

import PwaRegistrar from '@/components/pwa/PwaRegistrar'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'RunnitBack Command Center',
    template: '%s | RunnitBack',
  },
  description: 'Unified internal workflow for review, publishing, analytics, and source ingestion.',
  applicationName: 'RunnitBack',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'RunnitBack',
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#f3f1ed',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="theme-color" content="#f3f1ed" />
        <meta name="msapplication-navbutton-color" content="#f3f1ed" />
      </head>
      <body className="bg-[var(--bg-void)] text-[var(--text-primary)] antialiased overscroll-none">
        <PwaRegistrar />
        {children}
      </body>
    </html>
  )
}
