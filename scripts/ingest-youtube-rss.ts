import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

import { pollSourceChannel } from '../lib/rss-poll'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

type Args = {
  url: string
  channelKey: string
  displayName: string | null
  targetChannelId: string | null
}

type SourceChannelRow = {
  id: string
  channel_key: string
  display_name: string
  rss_url: string
  target_rbhq_channel_id: string | null
}

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : null
  return value?.trim() || null
}

function readArgs(): Args {
  const url = readArg('--url') ?? process.env.YOUTUBE_RSS_URL?.trim() ?? ''
  const channelKey = readArg('--channel') ?? process.env.YOUTUBE_SOURCE_CHANNEL_KEY?.trim() ?? ''
  const displayName = readArg('--display-name') ?? process.env.YOUTUBE_SOURCE_DISPLAY_NAME?.trim() ?? null
  const targetChannelId = readArg('--target-channel-id') ?? process.env.YOUTUBE_TARGET_RBHQ_CHANNEL_ID?.trim() ?? null

  if (!url) {
    throw new Error('Missing RSS URL. Use --url <rss_url> or YOUTUBE_RSS_URL.')
  }

  if (!channelKey) {
    throw new Error('Missing channel key. Use --channel <channel_key> or YOUTUBE_SOURCE_CHANNEL_KEY.')
  }

  return { url, channelKey, displayName, targetChannelId }
}

function createSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  }
  return createClient(supabaseUrl, serviceKey)
}

function isMissingSourceSchemaError(error: { message?: string } | null | undefined): boolean {
  const message = error?.message?.toLowerCase() ?? ''
  return (
    message.includes('source_channels') ||
    message.includes('ingested_videos') ||
    message.includes('schema cache') ||
    message.includes('does not exist')
  )
}

async function upsertSourceChannel(
  supabase: ReturnType<typeof createSupabase>,
  input: Args,
): Promise<SourceChannelRow> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('source_channels')
    .upsert(
      {
        channel_key: input.channelKey,
        display_name: input.displayName ?? input.channelKey,
        platform: 'youtube',
        rss_url: input.url,
        source_url: input.url,
        target_rbhq_channel_id: input.targetChannelId,
        enabled: true,
        updated_at: now,
      },
      { onConflict: 'channel_key' },
    )
    .select('id, channel_key, display_name, rss_url, target_rbhq_channel_id')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as SourceChannelRow
}

async function main() {
  try {
    const args = readArgs()
    const supabase = createSupabase()
    const sourceChannel = await upsertSourceChannel(supabase, args)
    const result = await pollSourceChannel(sourceChannel, { supabase })

    console.log(JSON.stringify(
      {
        result: result.error ? 'FAIL' : 'PASS',
        sourceChannel: {
          id: sourceChannel.id,
          channelKey: sourceChannel.channel_key,
          displayName: sourceChannel.display_name,
        },
        videosIngested: result.ingested,
        candidatesCreated: result.candidates,
        error: result.error,
      },
      null,
      2,
    ))
    if (result.error) process.exitCode = 1
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const migrationHint = isMissingSourceSchemaError(error instanceof Error ? error : null)
      ? 'Apply supabase/migrations/202607040003_source_ingestion_clip_candidates.sql before running real RSS ingest.'
      : null
    console.error(JSON.stringify({ result: 'FAIL', error: message, migrationHint }, null, 2))
    process.exitCode = 1
  }
}

void main()
