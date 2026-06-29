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
    statusBarStyle: 'black-translucent',
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
  themeColor: '#000000',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#000000" />
        <meta name="msapplication-navbutton-color" content="#000000" />
      </head>
      <body className="bg-black text-white antialiased overscroll-none">
        <PwaRegistrar />
        {children}
      </body>
    </html>
  )
}
