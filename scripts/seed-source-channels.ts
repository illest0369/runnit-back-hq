import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createClient } from '@supabase/supabase-js'

import { CHANNEL_META } from '../lib/channel-meta'

type SeedEntry = {
  channel_key: string
  display_name: string
  rss_url: string
  lane_key: string
  notes?: string
}

function resolveChannelId(laneKey: string): string | null {
  for (const [id, meta] of Object.entries(CHANNEL_META)) {
    if (meta.slug === laneKey) return id
  }
  return null
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

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.')
    process.exit(1)
  }

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false },
  })

  const seedPath = resolve(__dirname, '../sources/source_channels_seed.json')
  const seed = JSON.parse(readFileSync(seedPath, 'utf-8')) as SeedEntry[]

  console.log(`Seeding ${seed.length} source channels...\n`)

  let ok = 0
  let skipped = 0

  for (const entry of seed) {
    if (!validateRssUrl(entry.rss_url)) {
      console.warn(`  SKIP  ${entry.channel_key} — invalid RSS URL: ${entry.rss_url}`)
      skipped += 1
      continue
    }

    const targetChannelId = resolveChannelId(entry.lane_key)
    if (!targetChannelId) {
      console.warn(`  SKIP  ${entry.channel_key} — unknown lane_key: ${entry.lane_key}`)
      skipped += 1
      continue
    }

    const row = {
      channel_key: entry.channel_key,
      display_name: entry.display_name,
      platform: 'youtube',
      rss_url: entry.rss_url,
      target_rbhq_channel_id: targetChannelId,
      enabled: true,
    }

    const { error } = await db
      .from('source_channels')
      .upsert(row, { onConflict: 'channel_key' })

    if (error) {
      console.error(`  ERROR ${entry.channel_key} — ${error.message}`)
      skipped += 1
    } else {
      console.log(`  OK    ${entry.channel_key} → lane ${entry.lane_key} (${targetChannelId})`)
      ok += 1
    }
  }

  console.log(`\nDone: ${ok} upserted, ${skipped} skipped.`)
  process.exit(skipped > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
