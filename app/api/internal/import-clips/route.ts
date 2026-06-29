export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import { importClips, type ImportClipInput } from '@/lib/moderation-queue'

type ImportRequestBody = {
  channel_id?: unknown
  import_batch_id?: unknown
  clips?: unknown
}

function isValidImportSecret(request: Request): boolean {
  const expected = process.env.RBHQ_IMPORT_SECRET?.trim()
  return Boolean(expected && request.headers.get('x-rbhq-import-secret') === expected)
}

function missingImportEnv() {
  const missing = [
    'RBHQ_IMPORT_SECRET',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ].filter((name): name is string => Boolean(name && !process.env[name]?.trim()))

  if (!process.env.SUPABASE_URL?.trim() && !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    missing.push('SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL')
  }

  return missing
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function POST(request: Request) {
  const missingEnv = missingImportEnv()
  if (missingEnv.length > 0) {
    return NextResponse.json(
      { ok: false, error: `Missing import env: ${missingEnv.join(', ')}.` },
      { status: 500 },
    )
  }

  if (!isValidImportSecret(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized import request.' }, { status: 401 })
  }

  let body: ImportRequestBody
  try {
    body = (await request.json()) as ImportRequestBody
  } catch {
    return NextResponse.json({ ok: false, error: 'Malformed JSON body.' }, { status: 400 })
  }

  if (!Array.isArray(body.clips)) {
    return NextResponse.json({ ok: false, error: 'clips must be an array.' }, { status: 400 })
  }

  if (body.clips.length === 0) {
    return NextResponse.json({ ok: false, error: 'clips must contain at least one record.' }, { status: 400 })
  }

  if (body.clips.length > 100) {
    return NextResponse.json({ ok: false, error: 'Import batches are limited to 100 clips.' }, { status: 413 })
  }

  const result = await importClips({
    clips: body.clips as ImportClipInput[],
    channelId: readString(body.channel_id),
    importBatchId: readString(body.import_batch_id),
  })

  return NextResponse.json(
    {
      ok: true,
      ...result,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
