// LEGACY — not used in active ingest pipeline
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { isProductionBuild } from '@/lib/runtime'
import BottomNav from './BottomNav'
import LogoutButton from '@/components/LogoutButton'

interface Channel { id: string; name: string; category: string }

const CAT_BADGE: Record<string, string> = {
  sports:        'text-emerald-400 bg-emerald-400/10 border border-emerald-400/25',
  gaming:        'text-purple-400 bg-purple-400/10 border border-purple-400/25',
  combat:        'text-error bg-error/10 border border-error/25',
  womens_sports: 'text-pink-400 bg-pink-400/10 border border-pink-400/25',
}

function CategoryBadge({ category }: { category: string }) {
  const cls = CAT_BADGE[category] ?? 'text-primary-container bg-primary-container/10 border border-primary-container/25'
  return (
    <span className={`font-headline font-black text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-full ${cls}`}>
      {category.replace('_', ' ')}
    </span>
  )
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (isProductionBuild()) {
    return (
      <div className="min-h-dvh bg-background">
        <header className="fixed top-0 left-0 right-0 h-14 z-50 bg-background border-b border-outline-variant/20 flex items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary-container flex items-center justify-center flex-shrink-0">
              <span className="font-headline font-black text-[11px] text-on-primary">RB</span>
            </div>
            <span className="font-headline font-black text-sm uppercase tracking-tight text-primary">RUNNIT BACK</span>
          </div>
        </header>
        <main className="pt-14 pb-[88px] min-h-dvh">{children}</main>
        <BottomNav />
      </div>
    )
  }

  const { hasSupabaseEnv, supabaseAdmin } = await import('@/lib/supabase')

  if (!hasSupabaseEnv) {
    return (
      <div className="min-h-dvh bg-background">
        <header className="fixed top-0 left-0 right-0 h-14 z-50 bg-background border-b border-outline-variant/20 flex items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary-container flex items-center justify-center flex-shrink-0">
              <span className="font-headline font-black text-[11px] text-on-primary">RB</span>
            </div>
            <span className="font-headline font-black text-sm uppercase tracking-tight text-primary">RUNNIT BACK</span>
          </div>
        </header>
        <main className="pt-14 pb-[88px] min-h-dvh">{children}</main>
        <BottomNav />
      </div>
    )
  }

  const session = await getSession()
  if (!session) redirect('/login')

  const { data: channels } = await supabaseAdmin
    .from('channels').select('id, name, category')
    .in('id', session.channelIds).order('name')

  const channelList: Channel[] = channels ?? []
  const primary = channelList[0]

  return (
    <div className="min-h-dvh bg-background">
      {/* Fixed header */}
      <header className="fixed top-0 left-0 right-0 h-14 z-50 bg-background border-b border-outline-variant/20 flex items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary-container flex items-center justify-center shadow-[0_0_12px_rgba(0,245,255,0.4)] flex-shrink-0">
            <span className="font-headline font-black text-[11px] text-on-primary">RB</span>
          </div>
          <span className="font-headline font-black text-sm uppercase tracking-tight text-primary">RUNNIT BACK</span>
        </div>

        <div className="flex items-center gap-2.5">
          {primary && <CategoryBadge category={primary.category} />}
          <span className="font-headline font-semibold text-xs text-on-surface-variant">{session.username}</span>

          <LogoutButton />
        </div>
      </header>

      {/* Main content */}
      <main className="pt-14 pb-[88px] min-h-dvh">
        {children}
      </main>

      <BottomNav />
    </div>
  )
}
