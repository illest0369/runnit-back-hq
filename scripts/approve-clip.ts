import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

import { isDownloadableMp4Url } from '../lib/media-url'
import { getClipById } from '../lib/moderation-queue'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : null
  return value?.trim() || null
}

function createSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  }
  return createClient(supabaseUrl, serviceKey)
}

function hasRenderedMetadata(clip: { video_url: string | null; moderation_notes: string[]; risk_flags: string[] }): boolean {
  return (
    isDownloadableMp4Url(clip.video_url) &&
    (
      clip.risk_flags.includes('rendered_local_mp4') ||
      clip.moderation_notes.some((note) => note.startsWith('rendered_tiktok_mp4:'))
    )
  )
}

async function main() {
  const clipId = readArg('--clip-id') ?? process.env.CLIP_ID?.trim()
  if (!clipId) {
    throw new Error('Missing clip id. Use --clip-id <rendered_clip_id>.')
  }

  const supabase = createSupabase()
  const current = await getClipById(clipId, { includeMetricoolHandoffStatus: false })
  if (!current) {
    throw new Error('Clip not found.')
  }
  if (current.status !== 'pending') {
    throw new Error(`Clip must be pending before approval; found ${current.status}.`)
  }
  if (!hasRenderedMetadata(current)) {
    throw new Error('Clip approval requires rendered TikTok MP4 metadata.')
  }

  const now = new Date().toISOString()
  const notes = [
    ...current.moderation_notes.filter((note) => !note.startsWith('approved_for_n8n_dry_run:')),
    `approved_for_n8n_dry_run:${now}`,
    'Manual approval completed; n8n dry-run handoff may be requested.',
  ]

  let { data, error } = await supabase
    .from('clips')
    .update({
      status: 'approved',
      publish_status: 'ready_for_automation',
      approved_at: now,
      moderation_notes: notes,
      risk_flags: [...new Set([...current.risk_flags, 'ready_for_n8n_dry_run'])],
      updated_at: now,
    })
    .eq('id', clipId)
    .eq('status', 'pending')
    .select('id, status, publish_status, approved_at, manually_published_at, video_url, moderation_notes, risk_flags')
    .single()

  if (error?.message.toLowerCase().includes('clips_publish_status_check')) {
    ;({ data, error } = await supabase
      .from('clips')
      .update({
        status: 'approved',
        publish_status: 'ready_for_manual_publish',
        approved_at: now,
        moderation_notes: notes,
        risk_flags: [...new Set([...current.risk_flags, 'ready_for_n8n_dry_run'])],
        updated_at: now,
      })
      .eq('id', clipId)
      .eq('status', 'pending')
      .select('id, status, publish_status, approved_at, manually_published_at, video_url, moderation_notes, risk_flags')
      .single())
  }

  if (error || !data) {
    throw new Error(error?.message || 'Clip could not be approved.')
  }

  console.log(JSON.stringify({ result: 'PASS', approval: data }, null, 2))
}

void main().catch((error) => {
  console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
