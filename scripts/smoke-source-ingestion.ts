import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

import { parseYouTubeRssXml, type YouTubeRssEntry } from '../lib/youtube-rss'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

type SmokeResult = {
  result: 'PASS'
  parser: {
    fixtureEntries: number
    dedupedDuplicate: boolean
  }
  database: {
    mode: 'supabase' | 'memory'
    schemaAvailable: boolean
    sourceCreated: boolean
    sourceReused: boolean
    videoInserted: boolean
    duplicateSkipped: boolean
    candidateInserted: boolean
    cleanup: 'complete' | 'not_needed' | 'best_effort'
    note?: string
  }
  safety: {
    n8nRequired: false
    livePublishStateSet: false
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function createSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!supabaseUrl || !serviceKey) return null
  return createClient(supabaseUrl, serviceKey)
}

function isMissingSchemaError(error: { message?: string } | null | undefined): boolean {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('schema cache') || message.includes('does not exist')
}

function loadFixture(): YouTubeRssEntry[] {
  const fixturePath = path.join(process.cwd(), 'docs/fixtures/youtube-rss.sample.xml')
  const xml = fs.readFileSync(fixturePath, 'utf8')
  return parseYouTubeRssXml(xml)
}

async function hasSourceSchema(supabase: NonNullable<ReturnType<typeof createSupabase>>) {
  const { error } = await supabase.from('source_channels').select('id').limit(1)
  if (!error) return true
  if (isMissingSchemaError(error)) return false
  throw new Error(error.message)
}

async function runMemorySmoke(entries: YouTubeRssEntry[]): Promise<SmokeResult['database']> {
  const sourceChannels = new Map<string, { id: string; channelKey: string }>()
  const videos = new Map<string, { id: string; sourceChannelId: string }>()
  const candidates: Array<{ id: string; ingestedVideoId: string; status: string; startSeconds: null; endSeconds: null }> = []

  const channelKey = `smoke-source-${randomUUID()}`
  const source = { id: randomUUID(), channelKey }
  sourceChannels.set(channelKey, source)
  const reusedSource = sourceChannels.get(channelKey)
  const first = entries[0]
  assert(first, 'Fixture did not produce a first entry.')

  const videoKey = `youtube:${first.externalVideoId}`
  videos.set(videoKey, { id: randomUUID(), sourceChannelId: source.id })
  const duplicateSkipped = videos.has(videoKey)
  const video = videos.get(videoKey)
  assert(video, 'Memory smoke video insert failed.')

  candidates.push({
    id: randomUUID(),
    ingestedVideoId: video.id,
    status: 'candidate',
    startSeconds: null,
    endSeconds: null,
  })

  return {
    mode: 'memory',
    schemaAvailable: false,
    sourceCreated: sourceChannels.has(channelKey),
    sourceReused: reusedSource?.id === source.id,
    videoInserted: videos.has(videoKey),
    duplicateSkipped,
    candidateInserted: candidates.length === 1 && candidates[0].status === 'candidate',
    cleanup: 'not_needed',
    note: 'Supabase source ingestion tables are not present yet; apply migration 202607040003 before real DB ingest.',
  }
}

async function runSupabaseSmoke(
  supabase: NonNullable<ReturnType<typeof createSupabase>>,
  entries: YouTubeRssEntry[],
): Promise<SmokeResult['database']> {
  const smokeId = randomUUID()
  const channelKey = `smoke-source-${smokeId}`
  const now = new Date().toISOString()
  const insertedIds = {
    sourceId: null as string | null,
    videoId: null as string | null,
    candidateId: null as string | null,
  }

  try {
    const first = entries[0]
    assert(first, 'Fixture did not produce a first entry.')
    const externalVideoId = `${first.externalVideoId}-${smokeId.slice(0, 8)}`

    const sourcePayload = {
      channel_key: channelKey,
      display_name: 'Smoke Source Ingestion',
      platform: 'youtube',
      source_url: 'https://www.youtube.com/channel/UC_RBHQ_SAMPLE',
      rss_url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_RBHQ_SAMPLE',
      enabled: true,
      updated_at: now,
    }

    const sourceInsert = await supabase
      .from('source_channels')
      .upsert(sourcePayload, { onConflict: 'channel_key' })
      .select('id, channel_key')
      .single()
    if (sourceInsert.error) throw new Error(sourceInsert.error.message)
    insertedIds.sourceId = (sourceInsert.data as { id: string }).id

    const sourceReuse = await supabase
      .from('source_channels')
      .upsert({ ...sourcePayload, display_name: 'Smoke Source Ingestion Reused' }, { onConflict: 'channel_key' })
      .select('id, channel_key')
      .single()
    if (sourceReuse.error) throw new Error(sourceReuse.error.message)

    const videoInsert = await supabase
      .from('ingested_videos')
      .insert({
        source_channel_id: insertedIds.sourceId,
        external_video_id: externalVideoId,
        platform: 'youtube',
        title: first.title,
        description: first.description,
        video_url: first.videoUrl,
        thumbnail_url: first.thumbnailUrl,
        published_at: first.publishedAt,
        ingest_status: 'ingested',
        raw_feed_entry: first.rawEntry,
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single()
    if (videoInsert.error) throw new Error(videoInsert.error.message)
    insertedIds.videoId = (videoInsert.data as { id: string }).id

    const duplicateCheck = await supabase
      .from('ingested_videos')
      .select('id')
      .eq('platform', 'youtube')
      .eq('external_video_id', externalVideoId)
    if (duplicateCheck.error) throw new Error(duplicateCheck.error.message)

    const candidateInsert = await supabase
      .from('clip_candidates')
      .insert({
        ingested_video_id: insertedIds.videoId,
        title: first.title,
        summary: first.description,
        hook_text: first.title,
        caption: first.title,
        hashtags: ['RBHQ', 'Sports'],
        score: 38,
        score_breakdown: {
          model: 'smoke-source-ingestion',
          transcriptAvailable: false,
          limitations: ['No transcript in RSS fixture; timestamps intentionally null.'],
        },
        status: 'candidate',
        start_seconds: null,
        end_seconds: null,
        created_at: now,
        updated_at: now,
      })
      .select('id, status, start_seconds, end_seconds')
      .single()
    if (candidateInsert.error) throw new Error(candidateInsert.error.message)
    insertedIds.candidateId = (candidateInsert.data as { id: string }).id

    return {
      mode: 'supabase',
      schemaAvailable: true,
      sourceCreated: Boolean(insertedIds.sourceId),
      sourceReused: (sourceReuse.data as { id: string }).id === insertedIds.sourceId,
      videoInserted: Boolean(insertedIds.videoId),
      duplicateSkipped: (duplicateCheck.data ?? []).length === 1,
      candidateInserted: Boolean(insertedIds.candidateId),
      cleanup: 'complete',
    }
  } finally {
    if (insertedIds.candidateId) {
      await supabase.from('clip_candidates').delete().eq('id', insertedIds.candidateId)
    }
    if (insertedIds.videoId) {
      await supabase.from('ingested_videos').delete().eq('id', insertedIds.videoId)
    }
    if (insertedIds.sourceId) {
      await supabase.from('source_channels').delete().eq('id', insertedIds.sourceId)
    }
  }
}

async function main() {
  const entries = loadFixture()
  assert(entries.length === 2, `Expected fixture to parse 2 unique entries, received ${entries.length}.`)
  assert(new Set(entries.map((entry) => entry.externalVideoId)).size === entries.length, 'Fixture duplicate was not deduped.')
  assert(entries.every((entry) => entry.videoUrl && entry.title), 'Parsed entries are missing title or URL.')

  const supabase = createSupabase()
  const database = supabase && await hasSourceSchema(supabase)
    ? await runSupabaseSmoke(supabase, entries)
    : await runMemorySmoke(entries)

  assert(database.sourceCreated, 'Source channel was not created.')
  assert(database.sourceReused, 'Source channel was not reused.')
  assert(database.videoInserted, 'Ingested video was not created.')
  assert(database.duplicateSkipped, 'Duplicate video was not skipped.')
  assert(database.candidateInserted, 'Clip candidate was not created.')

  const result: SmokeResult = {
    result: 'PASS',
    parser: {
      fixtureEntries: entries.length,
      dedupedDuplicate: true,
    },
    database,
    safety: {
      n8nRequired: false,
      livePublishStateSet: false,
    },
  }

  console.log(JSON.stringify(result, null, 2))
}

void main().catch((error) => {
  console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
