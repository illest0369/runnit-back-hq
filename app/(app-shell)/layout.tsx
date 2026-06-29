export const dynamic = 'force-dynamic'
export const revalidate = 0

import { redirect } from 'next/navigation'

import LogoutButton from '@/components/LogoutButton'
import { getSession } from '@/lib/auth'
import AppTabNav from '@/components/runnitback/AppTabNav'

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()

  if (!session) {
    redirect('/login')
  }

  return (
    <div className="min-h-dvh bg-background text-on-surface">
      <header className="sticky top-0 z-40 border-b border-outline-variant/60 bg-background/95 px-4 pb-3 pt-[max(env(safe-area-inset-top),1rem)] backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-headline text-[0.7rem] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
              RunnitBack
            </p>
            <p className="truncate pt-1 font-body text-sm text-primary">
              {session.username}
            </p>
          </div>

          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto min-h-[calc(100dvh-9rem)] max-w-md px-4 pb-28 pt-4">
        {children}
      </main>

      <AppTabNav />
    </div>
  )
}
