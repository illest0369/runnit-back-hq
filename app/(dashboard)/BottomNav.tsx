'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/dashboard', label: 'QUEUE',    icon: 'dashboard_customize' },
  { href: '/pipeline',  label: 'PIPELINE', icon: 'account_tree' },
  { href: '/review',    label: 'REVIEW',   icon: 'rate_review' },
  { href: '/history',   label: 'HISTORY',  icon: 'history' },
  { href: '/sources',   label: 'MORE',     icon: 'more_horiz' },
]

export default function BottomNav() {
  const pathname = usePathname()
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center h-[72px] bg-background/95 backdrop-blur-xl border-t border-outline-variant/20">
      {TABS.map(tab => {
        const active = pathname === tab.href || (tab.href === '/review' && pathname?.startsWith('/review'))
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={[
              'flex flex-col items-center justify-center gap-[3px] px-3 py-1 rounded-xl transition-all no-underline',
              active ? 'text-primary-container bg-primary-container/10' : 'text-secondary hover:text-primary',
            ].join(' ')}
          >
            <span
              className="material-symbols-outlined text-[22px]"
              style={{ fontVariationSettings: active ? "'FILL' 1, 'wght' 600" : "'FILL' 0, 'wght' 400" }}
            >
              {tab.icon}
            </span>
            <span className="font-headline font-bold text-[9px] uppercase tracking-[0.08em]">
              {tab.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
