'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/queue', label: 'Queue', icon: 'video_library' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
]

export default function AppTabNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-outline-variant/60 bg-background/95 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-around px-4">
        {TABS.map((tab) => {
          const active = pathname === tab.href

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={[
                'flex min-w-28 items-center justify-center gap-2 rounded-full border px-4 py-3 text-sm transition-colors',
                active
                  ? 'border-primary-container bg-surface-container-high text-primary'
                  : 'border-outline-variant bg-surface-container text-on-surface-variant',
              ].join(' ')}
            >
              <span className="material-symbols-outlined text-lg">{tab.icon}</span>
              <span className="font-headline text-xs font-bold uppercase tracking-[0.16em]">
                {tab.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
