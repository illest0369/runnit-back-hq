import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

import {
  RB_WOMEN_CHANNEL_ID,
  RB_WOMEN_PHASE1_SOURCES,
  rbWomenPhase1ActiveSources,
  rbWomenPhase1NoisySources,
} from '../lib/rb-women-source-config'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

type SeedEntry = {
  channel_key: string
  display_name: string
  rss_url: string
  lane_key: string
  enabled?: boolean
  notes?: string
}

type SourceRow = {
  id?: string
  channel_key: string
  display_name: string
  rss_url: string
  enabled: boolean | null
  target_rbhq_channel_id: string | null
}

function createSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  }
  return createClient(supabaseUrl, serviceKey)
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name)
}

function validateRssUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.hostname === 'www.youtube.com' &&
      parsed.pathname === '/feeds/videos.xml' &&
      /^UC[a-zA-Z0-9_-]{20,}$/.test(parsed.searchParams.get('channel_id') ?? '')
    )
  } catch {
    return false
  }
}

function loadWomenSeed(): SeedEntry[] {
  const seedPath = resolve(__dirname, '../sources/source_channels_seed.json')
  const seed = JSON.parse(readFileSync(seedPath, 'utf8')) as SeedEntry[]
  return seed.filter((entry) => entry.lane_key === 'women')
}

function sourceConfigForKey(channelKey: string) {
  return RB_WOMEN_PHASE1_SOURCES.find((source) => source.channelKey === channelKey) ?? null
}

async function loadDbSources() {
  const { data, error } = await createSupabase()
    .from('source_channels')
    .select('id, channel_key, display_name, rss_url, enabled, target_rbhq_channel_id')
    .eq('target_rbhq_channel_id', RB_WOMEN_CHANNEL_ID)
    .order('display_name')

  if (error) throw new Error(error.message)
  return (data ?? []) as SourceRow[]
}

function compareSources(seed: SeedEntry[], dbSources: SourceRow[]) {
  const activeConfig = rbWomenPhase1ActiveSources()
  const noisyConfig = rbWomenPhase1NoisySources()
  const seedByKey = new Map(seed.map((entry) => [entry.channel_key, entry]))
  const dbByKey = new Map(dbSources.map((source) => [source.channel_key, source]))
  const activeKeys = activeConfig.map((source) => source.channelKey)
  const noisyKeys = noisyConfig.map((source) => source.channelKey)

  return {
    activeConfig: activeConfig.map((source) => ({
      channelKey: source.channelKey,
      displayName: source.displayName,
      priority: source.priority,
      sourcePriorityScore: source.sourcePriorityScore,
      seeded: seedByKey.has(source.channelKey),
      inDb: dbByKey.has(source.channelKey),
      enabledInDb: dbByKey.get(source.channelKey)?.enabled === true,
      rssUrl: seedByKey.get(source.channelKey)?.rss_url ?? dbByKey.get(source.channelKey)?.rss_url ?? null,
    })),
    noisyConfig: noisyConfig.map((source) => ({
      channelKey: source.channelKey,
      displayName: source.displayName,
      priority: source.priority,
      active: source.active,
      inDb: dbByKey.has(source.channelKey),
      enabledInDb: dbByKey.get(source.channelKey)?.enabled === true,
    })),
    missingSeedEntries: activeKeys.filter((key) => !seedByKey.has(key)),
    missingDbRows: activeKeys.filter((key) => !dbByKey.has(key)),
    disabledActiveRows: activeKeys.filter((key) => dbByKey.has(key) && dbByKey.get(key)?.enabled !== true),
    enabledNonActiveRows: dbSources
      .filter((source) => source.enabled === true && !activeKeys.includes(source.channel_key))
      .map((source) => source.channel_key),
    invalidSeedUrls: seed
      .filter((entry) => !validateRssUrl(entry.rss_url))
      .map((entry) => entry.channel_key),
    counts: {
      activeConfig: activeKeys.length,
      activeSeedRows: seed.filter((entry) => activeKeys.includes(entry.channel_key)).length,
      dbRows: dbSources.length,
      enabledDbRows: dbSources.filter((source) => source.enabled === true).length,
      noisyConfig: noisyKeys.length,
    },
  }
}

async function syncSources(seed: SeedEntry[]) {
  const db = createSupabase()
  const configByKey = new Map(RB_WOMEN_PHASE1_SOURCES.map((source) => [source.channelKey, source]))
  const synced: string[] = []
  const skipped: Array<{ channelKey: string; reason: string }> = []

  for (const entry of seed) {
    const configSource = configByKey.get(entry.channel_key)
    if (!configSource) {
      skipped.push({ channelKey: entry.channel_key, reason: 'Not in RB Women Phase 1 source config.' })
      continue
    }
    if (!validateRssUrl(entry.rss_url)) {
      skipped.push({ channelKey: entry.channel_key, reason: 'Invalid YouTube RSS URL.' })
      continue
    }

    const enabled = configSource.active && entry.enabled !== false
    const { error } = await db
      .from('source_channels')
      .upsert(
        {
          channel_key: entry.channel_key,
          display_name: entry.display_name,
          platform: 'youtube',
          rss_url: entry.rss_url,
          source_url: entry.rss_url,
          target_rbhq_channel_id: RB_WOMEN_CHANNEL_ID,
          enabled,
        },
        { onConflict: 'channel_key' },
      )

    if (error) {
      skipped.push({ channelKey: entry.channel_key, reason: error.message })
    } else {
      synced.push(`${entry.channel_key}:${enabled ? 'enabled' : 'disabled'}`)
    }
  }

  const activeKeys = rbWomenPhase1ActiveSources().map((source) => source.channelKey)
  const { data: existing, error: loadError } = await db
    .from('source_channels')
    .select('channel_key')
    .eq('target_rbhq_channel_id', RB_WOMEN_CHANNEL_ID)
    .eq('enabled', true)

  if (loadError) throw new Error(loadError.message)

  const disableKeys = ((existing ?? []) as Array<{ channel_key: string }>)
    .map((source) => source.channel_key)
    .filter((key) => !activeKeys.includes(key))

  if (disableKeys.length > 0) {
    const { error } = await db
      .from('source_channels')
      .update({ enabled: false })
      .in('channel_key', disableKeys)
      .eq('target_rbhq_channel_id', RB_WOMEN_CHANNEL_ID)
    if (error) throw new Error(error.message)
  }

  return { synced, skipped, disabledNonActiveRows: disableKeys }
}

async function main() {
  const seed = loadWomenSeed()
  const before = await loadDbSources()
  const beforeComparison = compareSources(seed, before)
  const sync = hasFlag('--sync') ? await syncSources(seed) : null
  const after = sync ? await loadDbSources() : before
  const afterComparison = compareSources(seed, after)

  console.log(JSON.stringify({
    result: 'PASS',
    mode: sync ? 'sync' : 'read_only',
    before: {
      sources: before,
      comparison: beforeComparison,
    },
    sync,
    after: {
      sources: after,
      comparison: afterComparison,
    },
    safety: {
      deletesHistoricalCandidates: false,
      touchesOtherLanes: false,
      downloadsVideo: false,
      rendersVideo: false,
      uploadsVideo: false,
      postsVideo: false,
      triggersTikTokDryRun: false,
      livePublish: false,
    },
  }, null, 2))
}

void main().catch((error) => {
  console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
