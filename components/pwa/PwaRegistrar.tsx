'use client'

import { useEffect } from 'react'

export default function PwaRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }

    if (process.env.NEXT_PUBLIC_ENABLE_SERVICE_WORKER !== '1') {
      return
    }

    let cancelled = false

    async function registerIfAvailable() {
      if (cancelled) return

      await navigator.serviceWorker.register('/sw.js')
    }

    void registerIfAvailable().catch((error) => {
      console.warn('Service worker registration failed:', error)
    })

    return () => {
      cancelled = true
    }
  }, [])

  return null
}
