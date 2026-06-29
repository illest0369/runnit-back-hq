'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import SettingsClient from '@/components/runnitback/SettingsClient'
import type { AppChannel, AppUserSettings, ReplyAnalysis } from '@/lib/runnitback'

type SettingsContextPayload = {
  channels: AppChannel[]
  settings: AppUserSettings
  analysis: ReplyAnalysis
}

const FALLBACK_SETTINGS: AppUserSettings = {
  id: 'client-fallback',
  user_id: 'client-fallback',
  default_channel_id: null,
  notifications_enabled: false,
  view_preference: 'compact',
}

const FALLBACK_ANALYSIS: ReplyAnalysis = {
  most_used_reply_types: [],
  most_reused_suggestions: [],
  most_repeated_final_replies: [],
}

export default function SettingsPageClient() {
  const router = useRouter()
  const [payload, setPayload] = useState<SettingsContextPayload | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    async function load() {
      try {
        const response = await fetch('/api/settings/context', {
          cache: 'no-store',
          credentials: 'include',
        })

        if (response.status === 401) {
          router.replace('/login')
          return
        }

        const data = (await response.json()) as Partial<SettingsContextPayload> & {
          error?: string
        }

        if (!response.ok) {
          throw new Error(data.error || 'Unable to load settings.')
        }

        if (!isMounted) {
          return
        }

        setPayload({
          channels: data.channels ?? [],
          settings: data.settings ?? FALLBACK_SETTINGS,
          analysis: data.analysis ?? FALLBACK_ANALYSIS,
        })
      } catch (loadError) {
        if (!isMounted) {
          return
        }

        setError(
          loadError instanceof Error ? loadError.message : 'Unable to load settings.',
        )
      }
    }

    void load()

    return () => {
      isMounted = false
    }
  }, [router])

  if (error) {
    return (
      <div className="space-y-3">
        <h1 className="font-headline text-[1.9rem] font-bold tracking-tight text-primary">
          Settings unavailable
        </h1>
        <p className="font-body text-sm leading-6 text-on-surface-variant">{error}</p>
      </div>
    )
  }

  if (!payload) {
    return (
      <div className="space-y-3">
        <h1 className="font-headline text-[1.9rem] font-bold tracking-tight text-primary">
          Loading settings
        </h1>
        <p className="font-body text-sm leading-6 text-on-surface-variant">
          Pulling your channel access and reply patterns.
        </p>
      </div>
    )
  }

  return (
    <SettingsClient
      analysis={payload.analysis}
      channels={payload.channels}
      initialSettings={payload.settings}
    />
  )
}
