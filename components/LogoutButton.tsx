'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export default function LogoutButton() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  async function handleLogout() {
    setError('')

    try {
      try {
        const { getSupabaseBrowserClient } = await import('@/lib/supabase-browser')
        const supabase = getSupabaseBrowserClient()
        await supabase.auth.signOut({ scope: 'global' })
      } catch (signOutError) {
        console.warn('Supabase browser sign-out skipped:', signOutError)
      }

      const response = await fetch('/api/logout', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Unable to fully clear the session.')
      }

      sessionStorage.removeItem('rb_selected')
      sessionStorage.removeItem('rb_channel_id')

      startTransition(() => {
        router.replace('/login')
        router.refresh()
      })
    } catch (logoutError) {
      setError(
        logoutError instanceof Error ? logoutError.message : 'Unable to log out right now.',
      )
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleLogout}
        disabled={isPending}
        className="flex items-center justify-center w-7 h-7 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/20 text-on-surface-variant hover:text-error transition-colors disabled:opacity-60"
        title="Log out"
        aria-label="Log out"
      >
        <span className="material-symbols-outlined text-base">logout</span>
      </button>
      {error ? (
        <span className="text-[10px] font-headline font-bold uppercase tracking-[0.08em] text-error">
          {error}
        </span>
      ) : null}
    </div>
  )
}
