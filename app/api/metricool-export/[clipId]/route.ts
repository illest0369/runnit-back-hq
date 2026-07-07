export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getSessionFromRequest } from '@/lib/auth'
import { validateCsrfRequest } from '@/lib/csrf'
import { updateClipEditorial } from '@/lib/moderation-queue'

type RouteContext = {
  params: Promise<{ clipId: string }>
}

const EditorialSchema = z.object({
  caption: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
})

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (!validateCsrfRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Invalid CSRF token.' }, { status: 403 })
  }

  const { clipId } = await context.params

  let body: z.infer<typeof EditorialSchema>
  try {
    body = EditorialSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 })
  }

  if (body.caption === undefined && body.hashtags === undefined) {
    return NextResponse.json({ ok: false, error: 'Nothing to update.' }, { status: 400 })
  }

  try {
    const updated = await updateClipEditorial(clipId, {
      caption: body.caption,
      hashtags: body.hashtags,
      channelIds: session.channelIds,
    })

    if (!updated) {
      return NextResponse.json({ ok: false, error: 'Clip not found.' }, { status: 404 })
    }

    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Update failed.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
