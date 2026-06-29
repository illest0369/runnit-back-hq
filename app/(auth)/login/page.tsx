import { redirect } from 'next/navigation'

import LoginClient from '@/components/auth/LoginClient'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function LoginPage() {
  const session = await getSession()

  if (session) {
    redirect('/queue')
  }

  return <LoginClient />
}
