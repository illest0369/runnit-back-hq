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
    <main
      className="rbhq-system flex min-h-dvh items-center justify-center bg-[var(--rb-bg)] text-[var(--rb-text)]"
      style={{ padding: 'calc(env(safe-area-inset-top, 0px) + 24px) 16px 24px' }}
    >
      <section
        className="w-full max-w-[420px] rounded-[24px] border border-[var(--rb-line)] bg-[var(--rb-surface)] shadow-[0_18px_60px_rgba(27,25,21,0.10)]"
        style={{ padding: '28px 22px' }}
      >
        <div className="text-center">
          <p className="text-[13px] font-semibold uppercase tracking-[0.42em] text-[var(--rb-text)]">RBHQ</p>
          <span className="block h-px w-12 bg-[var(--rb-accent)]" style={{ margin: '20px auto 0' }} />
          <p className="text-[28px] font-semibold lowercase" style={{ marginTop: '24px' }}>sign in</p>
          <p className="mx-auto max-w-[260px] text-[13px] font-normal lowercase leading-5 text-[var(--rb-muted)]" style={{ marginTop: '12px' }}>
            use your assigned RBHQ login
          </p>
        </div>

        <form className="flex flex-col" onSubmit={submitCredentials} style={{ gap: '16px', marginTop: '28px' }}>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--rb-muted)]" style={{ marginBottom: '8px' }}>email</span>
            <input
              autoComplete="email"
              className="h-12 w-full rounded-[14px] border border-[var(--rb-line)] bg-[var(--rb-bg)] px-4 text-[15px] text-[var(--rb-text)] outline-none transition placeholder:text-[var(--rb-faint)] focus:border-[var(--rb-accent)] focus:bg-white"
              inputMode="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@runnitbackhq.com"
              required
              style={{ padding: '0 16px' }}
              type="email"
              value={email}
            />
          </label>

          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--rb-muted)]" style={{ marginBottom: '8px' }}>password</span>
            <input
              autoComplete="current-password"
              className="h-12 w-full rounded-[14px] border border-[var(--rb-line)] bg-[var(--rb-bg)] px-4 text-[15px] text-[var(--rb-text)] outline-none transition placeholder:text-[var(--rb-faint)] focus:border-[var(--rb-accent)] focus:bg-white"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="password"
              required
              style={{ padding: '0 16px' }}
              type="password"
              value={password}
            />
          </label>

          {error ? (
            <p className="rounded-[14px] border border-[var(--rb-accent)]/20 bg-[var(--rb-accent)]/10 text-center text-xs lowercase leading-5 text-[var(--rb-accent)]" style={{ padding: '8px 12px' }}>
              {error}
            </p>
          ) : null}

          <button
            className="flex h-12 w-full items-center justify-center rounded-[14px] bg-[var(--rb-accent)] text-[13px] font-bold uppercase tracking-[0.22em] text-white shadow-[0_16px_40px_rgba(226,22,43,0.22)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isPending}
            type="submit"
          >
            {isPending ? (
              <span className="h-4 w-4 animate-spin rounded-full border border-white/80 border-t-transparent" />
            ) : (
              'continue'
            )}
          </button>
        </form>

        <p className="text-center text-[10px] lowercase leading-4 text-[var(--rb-faint)]" style={{ marginTop: '24px' }}>authorized testers only</p>
      </section>
    </main>
  )
}
