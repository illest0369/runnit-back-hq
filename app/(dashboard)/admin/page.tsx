// LEGACY — not used in active ingest pipeline
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { isProductionBuild } from '@/lib/runtime'
import AdminClient from './AdminClient'

export default async function AdminPage() {
  if (isProductionBuild()) {
    return (
      <div className="p-3 pb-24 max-w-[600px]">
        <p className="font-headline font-bold text-[9px] text-on-surface-variant uppercase tracking-[0.12em] mb-1">SYSTEM</p>
        <h1 className="font-headline font-black text-[28px] text-on-surface tracking-tight leading-none mb-1">ADMIN</h1>
        <p className="text-[11px] text-on-surface-variant uppercase tracking-[0.06em] mb-7">Live admin data loads at runtime</p>
        <AdminClient users={[]} channels={[]} currentUserId="" />
      </div>
    )
  }

  const { hasSupabaseEnv, supabaseAdmin } = await import('@/lib/supabase')

  if (!hasSupabaseEnv) {
    return (
      <div className="p-3 pb-24 max-w-[600px]">
        <p className="font-headline font-bold text-[9px] text-on-surface-variant uppercase tracking-[0.12em] mb-1">SYSTEM</p>
        <h1 className="font-headline font-black text-[28px] text-on-surface tracking-tight leading-none mb-1">ADMIN</h1>
        <p className="text-[11px] text-on-surface-variant uppercase tracking-[0.06em] mb-7">Live admin data loads at runtime</p>
        <AdminClient users={[]} channels={[]} currentUserId="" />
      </div>
    )
  }

  const session = await getSession()
  if (!session || session.role !== 'admin') redirect('/dashboard')

  const [{ data: users }, { data: channels }] = await Promise.all([
    supabaseAdmin.from('users').select('id, username, role, created_at').order('username'),
    supabaseAdmin.from('channels').select('id, name, handle, category').order('name')
  ])

  return (
    <div className="p-3 pb-24 max-w-[600px]">
      <p className="font-headline font-bold text-[9px] text-on-surface-variant uppercase tracking-[0.12em] mb-1">SYSTEM</p>
      <h1 className="font-headline font-black text-[28px] text-on-surface tracking-tight leading-none mb-1">ADMIN</h1>
      <p className="text-[11px] text-on-surface-variant uppercase tracking-[0.06em] mb-7">Manage operators and channels</p>
      <AdminClient users={users ?? []} channels={channels ?? []} currentUserId={session.userId} />
    </div>
  )
}
