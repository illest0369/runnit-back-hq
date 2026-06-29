'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import EngageClient from '@/components/runnitback/EngageClient'
import type { AppPost } from '@/lib/runnitback'

export default function EngagePageClient({ postId }: { postId: string }) {
  const router = useRouter()
  const [post, setPost] = useState<AppPost | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isActive = true

    async function loadPost() {
      try {
        const response = await fetch(`/api/posts/${postId}`, {
          cache: 'no-store',
        })

        if (response.status === 401) {
          router.replace('/login')
          return
        }

        if (response.status === 403 || response.status === 404) {
          router.replace('/queue')
          return
        }

        const data = (await response.json()) as { post?: AppPost; error?: string }
        if (!response.ok || !data.post) {
          throw new Error(data.error || 'Unable to load post.')
        }

        if (isActive) {
          setPost(data.post)
        }
      } catch (nextError) {
        if (isActive) {
          setError(nextError instanceof Error ? nextError.message : 'Unable to load post.')
        }
      }
    }

    void loadPost()

    return () => {
      isActive = false
    }
  }, [postId, router])

  if (error) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-6 text-center">
        <p className="font-headline text-xs uppercase tracking-[0.1em] text-on-surface-variant">
          {error}
        </p>
      </div>
    )
  }

  if (!post) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-6 text-center">
        <p className="font-headline text-xs uppercase tracking-[0.1em] text-on-surface-variant">
          Loading engage view
        </p>
      </div>
    )
  }

  return <EngageClient post={post} />
}
