'use client'

import { useState, useTransition } from 'react'

import {
  type AppChannel,
  type AppUserSettings,
  type ReplyAnalysis,
} from '@/lib/runnitback'
import { getCsrfHeaders } from '@/lib/client-csrf'

type SettingsClientProps = {
  channels: AppChannel[]
  initialSettings: AppUserSettings
  analysis: ReplyAnalysis
}

export default function SettingsClient({
  channels,
  initialSettings,
  analysis,
}: SettingsClientProps) {
  const [settings, setSettings] = useState(initialSettings)
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      setMessage('')

      const csrfHeaders = await getCsrfHeaders()
      const response = await fetch('/api/settings', {
        method: 'PUT',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders },
        body: JSON.stringify(settings),
      })

      const data = (await response.json()) as {
        error?: string
        settings?: AppUserSettings
      }

      if (!response.ok || !data.settings) {
        setMessage(data.error || 'Unable to save settings.')
        return
      }

      setSettings(data.settings)
      setMessage('Settings saved.')
    })
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <p className="font-headline text-[0.72rem] font-bold uppercase tracking-[0.22em] text-on-surface-variant">
          User Settings
        </p>
        <h1 className="font-headline text-[1.9rem] font-bold tracking-tight text-primary">
          Personalize the operator view.
        </h1>
        <p className="max-w-sm font-body text-sm leading-6 text-on-surface-variant">
          Default the right channel, keep notifications lightweight, and tune the list density
          for faster queue review on mobile.
        </p>
      </section>

      <section className="space-y-4 rounded-[1.75rem] border border-outline-variant/60 bg-surface-container p-4">
        <label className="block space-y-2">
          <span className="font-headline text-[0.68rem] font-bold uppercase tracking-[0.18em] text-on-surface-variant">
            Default Channel
          </span>
          <select
            className="w-full rounded-2xl border border-outline-variant/70 bg-background px-4 py-3 font-body text-[0.95rem] text-on-surface outline-none"
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                default_channel_id: event.target.value || null,
              }))
            }
            value={settings.default_channel_id ?? ''}
          >
            <option value="">Choose a default channel</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-2">
          <span className="font-headline text-[0.68rem] font-bold uppercase tracking-[0.18em] text-on-surface-variant">
            Notifications
          </span>
          <button
            className={[
              'flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left',
              settings.notifications_enabled
                ? 'border-primary-container bg-background text-primary'
                : 'border-outline-variant bg-background text-on-surface-variant',
            ].join(' ')}
            onClick={() =>
              setSettings((current) => ({
                ...current,
                notifications_enabled: !current.notifications_enabled,
              }))
            }
            type="button"
          >
            <div>
              <p className="font-body text-sm text-on-surface">App reminders only</p>
              <p className="pt-1 font-body text-xs text-on-surface-variant">
                No TikTok automation. Just a lightweight reminder state inside the app.
              </p>
            </div>
            <span className="font-headline text-[0.68rem] font-bold uppercase tracking-[0.16em]">
              {settings.notifications_enabled ? 'On' : 'Off'}
            </span>
          </button>
        </div>

        <div className="space-y-2">
          <span className="font-headline text-[0.68rem] font-bold uppercase tracking-[0.18em] text-on-surface-variant">
            View Preference
          </span>
          <div className="grid grid-cols-2 gap-2">
            {(['compact', 'comfortable'] as const).map((preference) => (
              <button
                key={preference}
                className={[
                  'rounded-2xl border px-4 py-3 font-headline text-[0.72rem] font-bold uppercase tracking-[0.16em]',
                  settings.view_preference === preference
                    ? 'border-primary-container bg-background text-primary'
                    : 'border-outline-variant bg-background text-on-surface-variant',
                ].join(' ')}
                onClick={() =>
                  setSettings((current) => ({
                    ...current,
                    view_preference: preference,
                  }))
                }
                type="button"
              >
                {preference}
              </button>
            ))}
          </div>
        </div>

        <button
          className="w-full rounded-2xl border border-primary-container px-4 py-3 font-headline text-[0.75rem] font-bold uppercase tracking-[0.16em] text-primary"
          disabled={isPending}
          onClick={save}
          type="button"
        >
          {isPending ? 'Saving' : 'Save Settings'}
        </button>

        {message ? (
          <p className="font-body text-sm text-on-surface-variant">{message}</p>
        ) : null}
      </section>

      <section className="space-y-4 rounded-[1.75rem] border border-outline-variant/60 bg-surface-container p-4">
        <div className="space-y-1">
          <p className="font-headline text-[0.68rem] font-bold uppercase tracking-[0.18em] text-on-surface-variant">
            Assigned Channels
          </p>
          <p className="font-body text-sm leading-6 text-on-surface-variant">
            Operators only see the channels mapped to their account.
          </p>
        </div>

        <div className="space-y-3">
          {channels.map((channel) => (
            <div
              key={channel.id}
              className="rounded-2xl border border-outline-variant/60 bg-background px-4 py-3"
            >
              <p className="font-body text-sm text-on-surface">{channel.name}</p>
              <p className="pt-1 font-body text-xs text-on-surface-variant">
                {channel.niche} • {channel.status}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-[1.75rem] border border-outline-variant/60 bg-surface-container p-4">
        <div className="space-y-1">
          <p className="font-headline text-[0.68rem] font-bold uppercase tracking-[0.18em] text-on-surface-variant">
            Reply Patterns
          </p>
          <p className="font-body text-sm leading-6 text-on-surface-variant">
            Early patterns from reply sessions. This is the self-improving loop the team can use later.
          </p>
        </div>

        <PatternList
          items={analysis.most_used_reply_types}
          title="Most used reply types"
        />
        <PatternList
          items={analysis.most_reused_suggestions}
          title="Most reused suggestions"
        />
        <PatternList
          items={analysis.most_repeated_final_replies}
          title="Most repeated final replies"
        />
      </section>
    </div>
  )
}

function PatternList({
  title,
  items,
}: {
  title: string
  items: Array<{ label: string; count: number }>
}) {
  return (
    <div className="space-y-3">
      <p className="font-headline text-[0.64rem] font-bold uppercase tracking-[0.18em] text-on-surface-variant">
        {title}
      </p>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/70 px-4 py-4">
          <p className="font-body text-sm text-on-surface-variant">
            No patterns yet. Reply sessions will start filling this in.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={`${title}-${item.label}`}
              className="flex items-center justify-between rounded-2xl border border-outline-variant/60 bg-background px-4 py-3"
            >
              <p className="max-w-[16rem] font-body text-sm leading-6 text-on-surface">
                {item.label}
              </p>
              <span className="font-headline text-[0.68rem] font-bold uppercase tracking-[0.16em] text-primary">
                {item.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
