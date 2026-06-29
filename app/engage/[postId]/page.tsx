export const dynamic = 'force-dynamic'
export const revalidate = 0

import EngagePageClient from '@/components/runnitback/EngagePageClient'

export default async function EngagePage({
  params,
}: {
  params: Promise<{ postId: string }>
}) {
  const { postId } = await params
  return <EngagePageClient postId={postId} />
}
