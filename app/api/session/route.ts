import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ channelIds: [] }, { status: 401 })
  return NextResponse.json({
    userId: session.userId,
    username: session.username,
    role: session.role,
    channelIds: session.channelIds,
  })
}
