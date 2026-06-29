'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import QueueScreen from '@/components/runnitback/QueueScreen'
import type { AppChannel, AppPost, AppRole, AppUserSettings } from '@/lib/runnitback'

type QueuePayload = {
  role: AppRole
  channels: AppChannel[]
  posts: AppPost[]
  settings: AppUserSettings
}

export default function QueuePageClient() {
  const router = useRouter()
  const [payload, setPayload] = useState<QueuePayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isActive = true

    async function loadQueue() {
      try {
        const response = await fetch('/api/queue', {
          cache: 'no-store',
        })

        if (response.status === 401) {
          router.replace('/login')
          return
        }

        const data = (await response.json()) as QueuePayload & { error?: string }
        if (!response.ok) {
          throw new Error(data.error || 'Unable to load queue.')
        }

        console.log('QUEUE DATA:', data)

        if (isActive) {
          setPayload(data)
        }
      } catch (nextError) {
        if (isActive) {
          setError(nextError instanceof Error ? nextError.message : 'Unable to load queue.')
        }
      }
    }

    void loadQueue()
    const intervalId = window.setInterval(() => {
      void loadQueue()
    }, 15000)

    return () => {
      isActive = false
      window.clearInterval(intervalId)
    }
  }, [router])

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black px-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">
          {error}
        </p>
      </div>
    )
  }

  if (!payload) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black px-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">
          Loading
        </p>
      </div>
    )
  }

  return (
    <QueueScreen
      channels={payload.channels}
      initialPosts={payload.posts}
      initialSettings={payload.settings}
      role={payload.role}
    />
  )
}
