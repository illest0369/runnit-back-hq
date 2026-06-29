'use client'

import { FormEvent, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { getCsrfToken, updateCsrfToken } from '@/lib/client-csrf'

type LoginResponse = {
  error?: string
  csrfToken?: string
}

export default function LoginClient() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isPending, start] = useTransition()

  useEffect(() => {
    void getCsrfToken().catch(() => {})
  }, [])

  function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    start(async () => {
      try {
        const csrfToken = await getCsrfToken()
        const response = await fetch('/api/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          body: JSON.stringify({
            email,
            password,
          }),
        })
        const data = (await response.json()) as LoginResponse

        if (!response.ok) {
          setError(data.error ?? 'Invalid email or password.')
          return
        }

        updateCsrfToken(data.csrfToken)
        router.replace('/queue')
      } catch {
        setError('Unable to sign in.')
      }
    })
  }

  return (
    <main className="rbhq-system flex min-h-dvh items-center justify-center bg-black px-5 py-8 text-[var(--rb-text)] sm:px-8">
      <section className="w-full max-w-[420px] rounded-[28px] border border-white/10 bg-[#090909] px-5 py-6 shadow-[0_24px_90px_rgba(0,0,0,0.48)] sm:px-7 sm:py-8">
        <div className="text-center">
          <p className="text-[13px] font-semibold uppercase tracking-[0.42em] text-[var(--rb-text)]">RBHQ</p>
          <p className="mt-6 text-[28px] font-semibold lowercase tracking-[-0.03em]">sign in</p>
          <p className="mx-auto mt-3 max-w-[260px] text-[13px] font-normal lowercase leading-5 text-[var(--rb-muted)]">
            use your assigned RBHQ login
          </p>
        </div>

        <form className="mt-7 space-y-4" onSubmit={submitCredentials}>
          <label className="block">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--rb-muted)]">email</span>
            <input
              autoComplete="email"
              className="h-12 w-full rounded-[14px] border border-white/12 bg-white/[0.065] px-4 text-[15px] text-[var(--rb-text)] outline-none transition placeholder:text-white/22 focus:border-[var(--rb-accent)] focus:bg-white/[0.085]"
              inputMode="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@runnitbackhq.com"
              required
              type="email"
              value={email}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--rb-muted)]">password</span>
            <input
              autoComplete="current-password"
              className="h-12 w-full rounded-[14px] border border-white/12 bg-white/[0.065] px-4 text-[15px] text-[var(--rb-text)] outline-none transition placeholder:text-white/22 focus:border-[var(--rb-accent)] focus:bg-white/[0.085]"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="password"
              required
              type="password"
              value={password}
            />
          </label>

          {error ? (
            <p className="rounded-[14px] border border-[var(--rb-accent)]/20 bg-[var(--rb-accent)]/10 px-3 py-2 text-center text-xs lowercase leading-5 text-[var(--rb-accent)]">
              {error}
            </p>
          ) : null}

          <button
            className="flex h-12 w-full items-center justify-center rounded-[14px] bg-[var(--rb-accent)] text-[13px] font-bold uppercase tracking-[0.22em] text-black shadow-[0_16px_40px_rgba(255,77,0,0.18)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isPending}
            type="submit"
          >
            {isPending ? (
              <span className="h-4 w-4 animate-spin rounded-full border border-black/70 border-t-transparent" />
            ) : (
              'continue'
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-[10px] lowercase leading-4 text-[var(--rb-faint)]">authorized testers only</p>
      </section>
    </main>
  )
}
