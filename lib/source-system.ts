import fs from 'node:fs'
import path from 'node:path'

export type SourceTier = 'S' | 'A' | 'B' | 'C'
export type RbhqSourceChannel = 'rb_sports' | 'rb_arena' | 'rb_women' | 'rb_combat' | 'rb_cfb'

export type SourceSystemSource = {
  name: string
  platform: string
  category: string
  tier: SourceTier
  priority_score: number
  emotionality: number
  clipability: number
  controversy: number
  repost_value: number
  engagement_strength: number
  source_type: string
  content_focus: string[]
  recommended_ingest_frequency: string
  notes: string
}

type SourceWeights = {
  tiers: Record<SourceTier, number>
  signals: Record<string, number>
  category_boosts: Record<string, number>
  penalties: Record<string, number>
}

type FreshnessDecay = {
  half_life_minutes: Record<string, number>
  decay_formula: string
  minimum_score_after_decay: number
  boost_windows: Record<string, number>
}

type QueueBalance = {
  max_same_source_consecutive: number
  max_same_category_percent_per_hour: number
  source_rotation: {
    enforce: boolean
    cooldown_minutes_after_pick: number
    S_tier_override_minutes: number
  }
}

type EditorialScoring = {
  score_components: Record<string, number>
  approval_thresholds: Record<string, number>
  channel_boosts: Record<RbhqSourceChannel, string[]>
}

type DuplicateRules = {
  title_similarity_threshold: number
  repost_cooldown_hours: Record<string, number>
  allow_repost_if: string[]
}

type IngestRules = {
  default_frequency: Record<SourceTier, string>
  max_items_per_source_per_run: Record<SourceTier, number>
  min_priority_score: number
  prefer_formats: string[]
  reject_if: string[]
  boost_if: string[]
}

export type SourceSystemConfig = {
  sourceWeights: SourceWeights
  freshnessDecay: FreshnessDecay
  ingestRules: IngestRules
  queueBalance: QueueBalance
  editorialScoring: EditorialScoring
  duplicateRules: DuplicateRules
}

export type SourceSystemSummary = {
  channel: RbhqSourceChannel
  total_sources: number
  tier_counts: Record<SourceTier, number>
  top_10_sources_by_priority_score: Array<Pick<SourceSystemSource, 'name' | 'platform' | 'category' | 'tier' | 'priority_score' | 'recommended_ingest_frequency'>>
  ingest_frequency_summary: Record<string, number>
}

const SOURCE_FILES: Record<RbhqSourceChannel, string> = {
  rb_sports: 'sources/rb_sports_sources.json',
  rb_arena: 'sources/rb_arena_sources.json',
  rb_women: 'sources/rb_women_sources.json',
  rb_combat: 'sources/rb_combat_sources.json',
  rb_cfb: 'sources/rb_cfb_sources.json',
}

const CHANNEL_IDS: Record<RbhqSourceChannel, string> = {
  rb_sports: 'a1000000-0000-0000-0000-000000000001',
  rb_arena: 'a1000000-0000-0000-0000-000000000002',
  rb_women: 'a1000000-0000-0000-0000-000000000004',
  rb_combat: 'a1000000-0000-0000-0000-000000000003',
  rb_cfb: '93484eef-06d8-46fd-bce2-ce252422c58e',
}

let cachedSources: Record<RbhqSourceChannel, SourceSystemSource[]> | null = null
let cachedConfig: SourceSystemConfig | null = null

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')) as T
}

function assertNumber(value: unknown, field: string, sourceName: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${sourceName}.${field} must be a number from 0-100.`)
  }
}

function validateSource(raw: unknown, index: number, channel: RbhqSourceChannel): SourceSystemSource {
  const source = raw as Partial<SourceSystemSource>
  const sourceName = `${channel}[${index}]`
  for (const field of ['name', 'platform', 'category', 'tier', 'source_type', 'recommended_ingest_frequency', 'notes'] as const) {
    if (typeof source[field] !== 'string' || !source[field]?.trim()) {
      throw new Error(`${sourceName}.${field} is required.`)
    }
  }
  if (!['S', 'A', 'B', 'C'].includes(source.tier ?? '')) {
    throw new Error(`${sourceName}.tier must be S, A, B, or C.`)
  }
  for (const field of ['priority_score', 'emotionality', 'clipability', 'controversy', 'repost_value', 'engagement_strength'] as const) {
    assertNumber(source[field], field, sourceName)
  }
  if (!Array.isArray(source.content_focus) || source.content_focus.some((item) => typeof item !== 'string')) {
    throw new Error(`${sourceName}.content_focus must be a string array.`)
  }
  return source as SourceSystemSource
}

export function loadSourceSystemSources() {
  if (cachedSources) return cachedSources

  cachedSources = Object.fromEntries(
    Object.entries(SOURCE_FILES).map(([channel, file]) => {
      const raw = readJson<unknown[]>(file)
      if (!Array.isArray(raw)) throw new Error(`${file} must be a JSON array.`)
      return [channel, raw.map((entry, index) => validateSource(entry, index, channel as RbhqSourceChannel))]
    }),
  ) as Record<RbhqSourceChannel, SourceSystemSource[]>

  return cachedSources
}

export function loadSourceSystemConfig(): SourceSystemConfig {
  if (cachedConfig) return cachedConfig
  cachedConfig = {
    sourceWeights: readJson<SourceWeights>('config/source_weights.json'),
    freshnessDecay: readJson<FreshnessDecay>('config/freshness_decay.json'),
    ingestRules: readJson<IngestRules>('config/ingest_rules.json'),
    queueBalance: readJson<QueueBalance>('config/queue_balance.json'),
    editorialScoring: readJson<EditorialScoring>('config/editorial_scoring.json'),
    duplicateRules: readJson<DuplicateRules>('config/duplicate_rules.json'),
  }
  return cachedConfig
}

export function channelKeyForChannelId(channelId: string | null | undefined): RbhqSourceChannel | null {
  return (Object.entries(CHANNEL_IDS).find(([, id]) => id === channelId)?.[0] as RbhqSourceChannel | undefined) ?? null
}

function normalizeText(value: string | null | undefined) {
  return value?.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() ?? ''
}

export function findSourceProfile(input: {
  channelId?: string | null
  sourceName?: string | null
  sourceUrl?: string | null
  platform?: string | null
  category?: string | null
}) {
  const channel = channelKeyForChannelId(input.channelId)
  if (!channel) return null

  const sourceName = normalizeText(input.sourceName)
  const sourceUrl = normalizeText(input.sourceUrl)
  const platform = normalizeText(input.platform)
  const category = normalizeText(input.category)

  return loadSourceSystemSources()[channel].find((source) => {
    const name = normalizeText(source.name)
    return (
      (sourceName && (name.includes(sourceName) || sourceName.includes(name))) ||
      (sourceUrl && sourceUrl.includes(name.replace(/\s+/g, ''))) ||
      (platform && platform === normalizeText(source.platform) && category && category === normalizeText(source.category))
    )
  }) ?? null
}

export function scoreSourceProfile(source: SourceSystemSource | null, fallbackPriorityWeight = 1) {
  const config = loadSourceSystemConfig()
  if (!source) return Math.max(1, fallbackPriorityWeight) * 50

  const weighted =
    source.priority_score * (config.sourceWeights.signals.priority_score ?? 0) +
    source.emotionality * (config.sourceWeights.signals.emotionality ?? 0) +
    source.clipability * (config.sourceWeights.signals.clipability ?? 0) +
    source.controversy * (config.sourceWeights.signals.controversy ?? 0) +
    source.repost_value * (config.sourceWeights.signals.repost_value ?? 0) +
    source.engagement_strength * (config.sourceWeights.signals.engagement_strength ?? 0)

  const tierBoost = config.sourceWeights.tiers[source.tier] ?? 1
  const categoryBoost = config.sourceWeights.category_boosts[source.category] ?? 1
  return Math.round(Math.min(100, weighted * tierBoost * categoryBoost))
}

export function balanceSourceOrder<T extends { category?: string | null; source_system_tier?: string | null }>(sources: T[]): T[] {
  const { queueBalance } = loadSourceSystemConfig()
  const maxConsecutive = Math.max(1, queueBalance.max_same_source_consecutive ?? 2)
  const remaining = [...sources]
  const balanced: T[] = []

  while (remaining.length > 0) {
    const recentCategories = balanced.slice(-maxConsecutive).map((source) => normalizeText(source.category))
    const blockedCategory = recentCategories.length === maxConsecutive && recentCategories.every((category) => category === recentCategories[0])
      ? recentCategories[0]
      : null
    const index = remaining.findIndex((source) => !blockedCategory || normalizeText(source.category) !== blockedCategory)
    balanced.push(remaining.splice(index >= 0 ? index : 0, 1)[0])
  }

  return balanced
}

export function freshnessScore(publishedAt: string | null | undefined, baseScore: number, kind = 'event_reaction') {
  if (!publishedAt) return baseScore
  const config = loadSourceSystemConfig().freshnessDecay
  const ageMinutes = Math.max(0, (Date.now() - Date.parse(publishedAt)) / 60_000)
  const halfLife = config.half_life_minutes[kind] ?? config.half_life_minutes.event_reaction ?? 90
  const decayed = baseScore * Math.pow(0.5, ageMinutes / halfLife)
  return Math.max(config.minimum_score_after_decay ?? 18, Math.round(decayed))
}

export function editorialScore(input: {
  title?: string | null
  sourceName?: string | null
  channelId?: string | null
  sourceScore: number
  publishedAt?: string | null
}) {
  const channel = channelKeyForChannelId(input.channelId)
  const boosts = channel ? loadSourceSystemConfig().editorialScoring.channel_boosts[channel] ?? [] : []
  const text = normalizeText(`${input.title ?? ''} ${input.sourceName ?? ''}`)
  const boostHits = boosts.filter((boost) => text.includes(normalizeText(boost))).length
  return Math.min(100, freshnessScore(input.publishedAt, input.sourceScore) + boostHits * 3)
}

export function sourceSystemSummaries(): SourceSystemSummary[] {
  const sourcesByChannel = loadSourceSystemSources()
  return Object.entries(sourcesByChannel).map(([channel, sources]) => {
    const tierCounts = { S: 0, A: 0, B: 0, C: 0 }
    const frequency: Record<string, number> = {}
    for (const source of sources) {
      tierCounts[source.tier] += 1
      frequency[source.recommended_ingest_frequency] = (frequency[source.recommended_ingest_frequency] ?? 0) + 1
    }
    return {
      channel: channel as RbhqSourceChannel,
      total_sources: sources.length,
      tier_counts: tierCounts,
      top_10_sources_by_priority_score: [...sources]
        .sort((left, right) => right.priority_score - left.priority_score)
        .slice(0, 10)
        .map(({ name, platform, category, tier, priority_score, recommended_ingest_frequency }) => ({
          name,
          platform,
          category,
          tier,
          priority_score,
          recommended_ingest_frequency,
        })),
      ingest_frequency_summary: frequency,
    }
  })
}

export function validateSourceSystem() {
  const sources = loadSourceSystemSources()
  loadSourceSystemConfig()
  return {
    ok: true,
    channels: Object.fromEntries(
      Object.entries(sources).map(([channel, channelSources]) => [channel, channelSources.length]),
    ),
  }
}
