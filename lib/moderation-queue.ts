import { hasSupabaseAdminEnv, supabaseAdminClient as supabaseAdmin } from './supabase-admin'
import { enqueueClipGenerationJob, enqueueRbhqPostJob } from './queue'
import { loadSourceSystemConfig } from './source-system'
import { isDownloadableMp4Url } from './media-url'

export type ClipModerationStatus = 'pending' | 'approved' | 'rejected' | 'skipped'
export type ClipPublishStatus =
  | 'not_ready'
  | 'metricool_ready_manual_export'
  | 'metricool_scheduled'
  | 'metricool_published'
  | 'metricool_failed'
  | 'needs_clip_render'
  | 'render_failed'
  | 'ready_for_manual_publish'
  | 'manually_published'

export type ModerationClip = {
  id: string
  channel_id: string | null
  external_id: string | null
  title: string
  hook: string
  source_name: string
  source_type: string
  thumbnail_url: string | null
  video_url: string | null
  source_url: string | null
  original_platform: string | null
  import_batch_id: string | null
  aspect_ratio: string | null
  duration_seconds: number | null
  ai_score: number
  virality_score: number | null
  hook_strength: number | null
  emotion: string | null
  sports_category: string | null
  recommended_hook: string | null
  moderation_notes: string[]
  risk_flags: string[]
  gemini_processed_at: string | null
  sport: string | null
  league: string | null
  status: ClipModerationStatus
  publish_status: ClipPublishStatus
  approved_at: string | null
  manually_published_at: string | null
  created_at: string
  updated_at: string
}

export type ModerationSource = {
  channel_id: string | null
  source_name: string
  source_type: string
  pending_count: number
  total_imported: number
  last_ingested_at: string | null
  status: 'active' | 'empty' | 'stale'
}

const METRICOOL_READY_PUBLISH_STATUSES = [
  'metricool_ready_manual_export',
  'ready_for_manual_publish',
] as const satisfies readonly ClipPublishStatus[]

const METRICOOL_EXPORTED_PUBLISH_STATUSES = [
  'metricool_published',
  'manually_published',
] as const satisfies readonly ClipPublishStatus[]

const METRICOOL_READY_PUBLISH_STATUS_SET: ReadonlySet<ClipPublishStatus> = new Set(
  METRICOOL_READY_PUBLISH_STATUSES,
)

const METRICOOL_EXPORTED_PUBLISH_STATUS_SET: ReadonlySet<ClipPublishStatus> = new Set(
  METRICOOL_EXPORTED_PUBLISH_STATUSES,
)

const METRICOOL_WORKFLOW_PUBLISH_STATUSES = [
  ...METRICOOL_READY_PUBLISH_STATUSES,
  'metricool_scheduled',
  'metricool_published',
  'manually_published',
  'metricool_failed',
] as const satisfies readonly ClipPublishStatus[]

const METRICOOL_SCHEMA_BACKED_PUBLISH_STATUSES = [
  'metricool_scheduled',
  'metricool_published',
  'metricool_failed',
] as const satisfies readonly ClipPublishStatus[]

const METRICOOL_STATUS_NOTE_PREFIX = 'metricool_status:'

function withMetricoolStatusNote(notes: string[], publishStatus: ClipPublishStatus): string[] {
  return [
    ...notes.filter((note) => !note.startsWith(METRICOOL_STATUS_NOTE_PREFIX)),
    `${METRICOOL_STATUS_NOTE_PREFIX}${publishStatus}`,
  ]
}

type ClipRow = {
  id: string
  channel_id?: string | null
  source_id: string | null
  external_id: string | null
  title: string
  hook: string
  source_name: string
  source_type: string
  thumbnail_url: string | null
  video_url: string | null
  source_url: string | null
  original_platform: string | null
  import_batch_id: string | null
  aspect_ratio: string | null
  duration_seconds: number | string | null
  ai_score: number | string | null
  virality_score: number | string | null
  hook_strength: number | string | null
  emotion: string | null
  sports_category: string | null
  recommended_hook: string | null
  moderation_notes: unknown
  risk_flags: unknown
  gemini_processed_at: string | null
  sport: string | null
  league: string | null
  status: ClipModerationStatus
  publish_status: ClipPublishStatus
  approved_at: string | null
  manually_published_at: string | null
  created_at: string
  updated_at: string
}

type GetClipsInput = {
  limit?: number
  channelIds?: string[]
  sourceName?: string | null
  status?: ClipModerationStatus
  publishStatus?: ClipPublishStatus
}

type GetClipByIdInput = {
  channelIds?: string[]
  includeMetricoolHandoffStatus?: boolean
}

const CLIP_SELECT =
  'id, channel_id, source_id, external_id, title, hook, source_name, source_type, thumbnail_url, video_url, source_url, original_platform, import_batch_id, aspect_ratio, duration_seconds, ai_score, virality_score, hook_strength, emotion, sports_category, recommended_hook, moderation_notes, risk_flags, gemini_processed_at, sport, league, status, publish_status, approved_at, manually_published_at, created_at, updated_at'

const DIRECT_MEDIA_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.webm']
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.avif']
const RB_CHANNEL_IDS = {
  sports: 'a1000000-0000-0000-0000-000000000001',
  arena: 'a1000000-0000-0000-0000-000000000002',
  combat: 'a1000000-0000-0000-0000-000000000003',
  women: 'a1000000-0000-0000-0000-000000000004',
  cfb: '93484eef-06d8-46fd-bce2-ce252422c58e',
} as const

export type ImportClipInput = {
  channel_id?: unknown
  external_id?: unknown
  title?: unknown
  hook?: unknown
  source_name?: unknown
  source_type?: unknown
  thumbnail_url?: unknown
  video_url?: unknown
  source_url?: unknown
  original_platform?: unknown
  import_batch_id?: unknown
  aspect_ratio?: unknown
  duration_seconds?: unknown
  ai_score?: unknown
  virality_score?: unknown
  hook_strength?: unknown
  emotion?: unknown
  sports_category?: unknown
  recommended_hook?: unknown
  moderation_notes?: unknown
  risk_flags?: unknown
  gemini_processed_at?: unknown
  sport?: unknown
  league?: unknown
}

export type ImportClipValidationError = {
  index: number
  dedupe_key?: string
  errors: string[]
}

export type ImportClipResult = {
  inserted_count: number
  skipped_count: number
  failed_count: number
  validation_errors: ImportClipValidationError[]
  inserted: ModerationClip[]
  skipped: Array<{ index: number; dedupe_key: string; reason: string }>
}

type ValidImportClip = {
  channel_id: string | null
  source_id?: string | null
  external_id: string | null
  title: string
  hook: string
  source_name: string
  source_type: string
  thumbnail_url: string
  video_url: string | null
  source_url: string | null
  original_platform: string | null
  import_batch_id: string | null
  aspect_ratio: string | null
  duration_seconds: number
  ai_score: number
  virality_score: number | null
  hook_strength: number | null
  emotion: string | null
  sports_category: string | null
  recommended_hook: string | null
  moderation_notes: string[]
  risk_flags: string[]
  gemini_processed_at: string | null
  sport: string | null
  league: string | null
}

function assertSupabaseQueue() {
  if (!hasSupabaseAdminEnv) {
    throw new Error('Supabase env vars are required for the moderation queue.')
  }
}

function isPublishStatusConstraintError(error: { message?: string } | null | undefined): boolean {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('clips_publish_status_check') || message.includes('publish_status')
}

async function updateClipPublishStatus(
  clipId: string,
  publishStatus: Extract<ClipPublishStatus, 'needs_clip_render' | 'metricool_scheduled' | 'metricool_failed' | 'render_failed'>,
): Promise<ModerationClip | null> {
  const { data, error } = await supabaseAdmin
    .from('clips')
    .update({ publish_status: publishStatus, updated_at: new Date().toISOString() })
    .eq('id', clipId)
    .select(CLIP_SELECT)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data ? normalizeClip(data as ClipRow) : null
}

async function moveClipToMetricoolReady(clipId: string): Promise<ModerationClip | null> {
  const patch = {
    publish_status: 'metricool_ready_manual_export' as const,
    updated_at: new Date().toISOString(),
  }

  let { data, error } = await supabaseAdmin
    .from('clips')
    .update(patch)
    .eq('id', clipId)
    .select(CLIP_SELECT)
    .maybeSingle()

  if (isPublishStatusConstraintError(error)) {
    ;({ data, error } = await supabaseAdmin
      .from('clips')
      .update({
        publish_status: 'ready_for_manual_publish',
        updated_at: patch.updated_at,
      })
      .eq('id', clipId)
      .select(CLIP_SELECT)
      .maybeSingle())
  }

  if (error) {
    throw new Error(error.message)
  }

  return data ? normalizeClip(data as ClipRow) : null
}

function clipHasRenderedAsset(clip: Pick<ModerationClip, 'video_url' | 'source_url' | 'publish_status'>): boolean {
  const videoUrl = clip.video_url?.trim()
  if (!videoUrl) {
    return false
  }

  if (METRICOOL_READY_PUBLISH_STATUS_SET.has(clip.publish_status)) {
    return true
  }

  const sourceUrl = clip.source_url?.trim()
  if (sourceUrl && videoUrl === sourceUrl) {
    return false
  }

  return isDirectPlayableMedia(videoUrl)
}

export function isMetricoolExportReadyStatus(publishStatus: ClipPublishStatus): boolean {
  return METRICOOL_READY_PUBLISH_STATUS_SET.has(publishStatus)
}

export function isMetricoolExportedStatus(publishStatus: ClipPublishStatus): boolean {
  return METRICOOL_EXPORTED_PUBLISH_STATUS_SET.has(publishStatus)
}

async function enqueueApprovedClipRender(
  clip: ModerationClip,
  input: { requestedByUserId?: string | null } = {},
): Promise<ModerationClip> {
  if (clipHasRenderedAsset(clip)) {
    const ready = await moveClipToMetricoolReady(clip.id)
    return ready ?? clip
  }

  if (clip.publish_status === 'needs_clip_render' || clip.publish_status === 'render_failed') {
    return clip
  }

  const sourceUrl = clip.source_url?.trim()
  if (!sourceUrl || !clip.channel_id) {
    const updated = await updateClipPublishStatus(clip.id, 'render_failed')
    return updated ?? { ...clip, publish_status: 'render_failed' }
  }

  const ready = await updateClipPublishStatus(clip.id, 'needs_clip_render')
  const nextClip = ready ?? { ...clip, publish_status: 'needs_clip_render' as const }

  try {
    await enqueueClipGenerationJob({
      videoUrl: sourceUrl,
      channelId: clip.channel_id,
      requestedByUserId: input.requestedByUserId || 'system',
      moderationClipId: clip.id,
    })
  } catch (error) {
    const failed = await updateClipPublishStatus(clip.id, 'render_failed')
    console.warn(
      '[clip-render] enqueue failed:',
      error instanceof Error ? error.message : error,
    )
    return failed ?? { ...nextClip, publish_status: 'render_failed' }
  }

  return nextClip
}

function normalizeClip(row: ClipRow): ModerationClip {
  const publishStatus =
    row.status === 'approved' &&
    (row.publish_status === 'metricool_ready_manual_export' ||
      row.publish_status === 'ready_for_manual_publish') &&
    !isDownloadableMp4Url(row.video_url)
      ? 'needs_clip_render'
      : row.publish_status

  return {
    ...row,
    publish_status: publishStatus,
    channel_id: row.channel_id ?? null,
    duration_seconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    ai_score: Number(row.ai_score ?? 0),
    virality_score: row.virality_score === null ? null : Number(row.virality_score),
    hook_strength: row.hook_strength === null ? null : Number(row.hook_strength),
    moderation_notes: normalizeStringArray(row.moderation_notes),
    risk_flags: normalizeStringArray(row.risk_flags),
  }
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return normalizeStringArray(parsed)
    } catch {
      return []
    }
  }

  return []
}

function normalizeDedupeText(value: string | null | undefined): string {
  return value?.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() ?? ''
}

function titleSimilarity(left: string, right: string): number {
  const leftWords = new Set(normalizeDedupeText(left).split(' ').filter(Boolean))
  const rightWords = new Set(normalizeDedupeText(right).split(' ').filter(Boolean))
  if (leftWords.size === 0 || rightWords.size === 0) return 0
  const overlap = [...leftWords].filter((word) => rightWords.has(word)).length
  return overlap / Math.max(leftWords.size, rightWords.size)
}

function isMissingColumnError(error: { message: string } | null | undefined): boolean {
  return Boolean(error?.message.toLowerCase().includes('column') && error.message.toLowerCase().includes('does not exist'))
}

function isMetricoolHandoffSchemaError(error: { message?: string } | null | undefined): boolean {
  const message = error?.message?.toLowerCase() ?? ''
  return (
    message.includes('metricool_handoffs') ||
    (message.includes('publish_status') && message.includes('does not exist'))
  )
}

function isSchemaBackedMetricoolStatus(value: unknown): value is (typeof METRICOOL_SCHEMA_BACKED_PUBLISH_STATUSES)[number] {
  return typeof value === 'string' && METRICOOL_SCHEMA_BACKED_PUBLISH_STATUSES.includes(value as never)
}

async function persistMetricoolStatusHandoff(
  clip: ModerationClip,
  input: {
    publishStatus: Extract<ClipPublishStatus, 'metricool_scheduled' | 'metricool_published' | 'metricool_failed'>
    metricoolPostId?: string | null
  },
): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await supabaseAdmin
    .from('metricool_handoffs')
    .insert({
      clip_id: clip.id,
      channel_id: clip.channel_id,
      metricool_post_id: input.metricoolPostId ?? null,
      status: input.publishStatus === 'metricool_failed' ? 'failed' : 'accepted',
      publish_status: input.publishStatus,
      created_at: now,
      updated_at: now,
    })

  if (error && !isMetricoolHandoffSchemaError(error)) {
    console.warn('[metricool] status handoff persistence skipped:', error.message)
  }
}

async function readLatestMetricoolHandoffStatuses(clipIds: string[]): Promise<Map<string, ClipPublishStatus>> {
  if (clipIds.length === 0) return new Map()

  const { data, error } = await supabaseAdmin
    .from('metricool_handoffs')
    .select('clip_id, publish_status, created_at')
    .in('clip_id', clipIds)
    .in('publish_status', [...METRICOOL_SCHEMA_BACKED_PUBLISH_STATUSES])
    .order('created_at', { ascending: false })

  if (error) {
    if (!isMetricoolHandoffSchemaError(error)) {
      console.warn('[metricool] handoff status read skipped:', error.message)
    }
    return new Map()
  }

  const statuses = new Map<string, ClipPublishStatus>()
  for (const row of (data ?? []) as Array<{ clip_id: string | null; publish_status: unknown }>) {
    if (!row.clip_id || statuses.has(row.clip_id) || !isSchemaBackedMetricoolStatus(row.publish_status)) {
      continue
    }
    statuses.set(row.clip_id, row.publish_status)
  }

  return statuses
}

async function hydrateMetricoolHandoffStatuses(clips: ModerationClip[]): Promise<ModerationClip[]> {
  const statuses = await readLatestMetricoolHandoffStatuses(clips.map((clip) => clip.id))
  if (statuses.size === 0) return clips

  return clips.map((clip) => {
    const publishStatus = statuses.get(clip.id)
    return publishStatus ? { ...clip, publish_status: publishStatus } : clip
  })
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readOptionalString(value: unknown): string | null {
  const next = readString(value)
  return next || null
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function normalizeChannelIds(value: string[] | undefined): string[] {
  return [...new Set((value ?? []).map((entry) => entry.trim()).filter(Boolean))]
}

// ---------------------------------------------------------------------------
// Canonical channel normalization
// ---------------------------------------------------------------------------

type CanonicalCategory = 'sports' | 'arena' | 'women' | 'combat' | 'cfb'

/** UUID → canonical category */
const CHANNEL_ID_TO_CATEGORY: Record<string, CanonicalCategory> = {
  [RB_CHANNEL_IDS.sports]: 'sports',
  [RB_CHANNEL_IDS.arena]: 'arena',
  [RB_CHANNEL_IDS.combat]: 'combat',
  [RB_CHANNEL_IDS.women]: 'women',
  [RB_CHANNEL_IDS.cfb]: 'cfb',
}

/** canonical category → the canonical UUID that clips get assigned */
const CATEGORY_TO_CHANNEL_ID: Record<CanonicalCategory, string> = {
  sports: RB_CHANNEL_IDS.sports,
  arena: RB_CHANNEL_IDS.arena,
  combat: RB_CHANNEL_IDS.combat,
  women: RB_CHANNEL_IDS.women,
  cfb: RB_CHANNEL_IDS.cfb,
}

/**
 * Keyword aliases per category.
 * These cover both generic channel name aliases AND specific sport/league terms.
 * Checked against a combined string of source_name + sport + league.
 */
const CATEGORY_KEYWORDS: Record<CanonicalCategory, string[]> = {
  sports: [
    // channel name aliases
    'sports', 'rb_sports', 'rbsports', 'rb sports',
    // specific sport keywords
    'nba', 'basketball', 'nfl', 'football', 'mlb', 'baseball',
    'soccer', 'mls', 'espn fc', 'premier league', 'champions league',
    // common sports media source names
    'espn', 'nbc sports', 'cbs sports', 'fox sports', 'nfl network', 'nba tv',
    'bleacher report', 'bleacherreport', 'the athletic', 'first take',
    'mcafee', 'pat mcafee', 'skip bayless', 'shannon sharpe', 'undisputed',
    'sportscenter', 'pardon my take',
  ],
  arena: [
    // channel name aliases
    'arena', 'rb_arena', 'rbsarena', 'rb arena', 'esports', 'gaming',
    // specific game keywords
    'valorant', 'league of legends', 'lol esports',
    'counter-strike', 'counter strike', 'call of duty league', 'cod league',
    'riot games', 'activision', 'overwatch', 'rocket league', 'twitch',
  ],
  women: [
    // channel name aliases
    'women', 'rb_women', 'rbwomen', 'rb women', "women's", 'womens',
    // specific keywords
    'wnba', 'nwsl', 'espnw', 'just women sports',
  ],
  combat: [
    // channel name aliases
    'combat', 'rb_combat', 'rbcombat', 'rb combat',
    // specific keywords
    'ufc', 'mma', 'boxing', 'fight', 'dazn', 'glory', 'pfl', 'bellator',
  ],
  cfb: [
    // channel name aliases
    'cfb', 'rb_cfb', 'rbcfb', 'rb cfb', 'collegefootball', 'college football',
    // specific keywords
    'ncaaf', 'sec network', 'big ten', 'on3', 'college gameday', '247sports',
  ],
}

function normalizedText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function matchesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle))
}

/** Determine canonical category from text signals (source_name, sport, league). */
function categoryFromText(
  sourceName: string | null,
  sport?: string | null,
  league?: string | null,
): CanonicalCategory | null {
  const combined = [sourceName, sport, league].map(normalizedText).join(' ')
  if (!combined.trim()) return null

  // Check from most specific to most generic to avoid false positives.
  // arena before sports so 'esports' wins over generic 'sports'.
  const order: CanonicalCategory[] = ['arena', 'women', 'combat', 'cfb', 'sports']
  for (const cat of order) {
    if (matchesAny(combined, CATEGORY_KEYWORDS[cat])) return cat
  }
  return null
}

/**
 * Resolve the canonical category for a clip.
 * Priority: stored channel_id UUID → text keyword matching.
 */
function categoryForClip(
  storedChannelId: string | null | undefined,
  sourceName: string | null,
  sport?: string | null,
  league?: string | null,
): CanonicalCategory | null {
  if (storedChannelId) {
    const fromId = CHANNEL_ID_TO_CATEGORY[storedChannelId]
    if (fromId) return fromId
  }
  return categoryFromText(sourceName, sport, league)
}

/**
 * Resolve the canonical category for the requesting operator.
 * Returns null if no known channel is in the list (allow-all mode).
 */
function categoryForChannelIds(channelIds: string[]): CanonicalCategory | null {
  for (const id of channelIds) {
    const cat = CHANNEL_ID_TO_CATEGORY[id]
    if (cat) return cat
  }
  return null
}

function isAllowedSourceForChannel(
  channelId: string | null,
  sourceName: string | null,
  sport?: string | null,
  league?: string | null,
): boolean {
  const source = normalizedText(sourceName)
  const sportValue = normalizedText(sport)
  const leagueValue = normalizedText(league)
  const combined = `${source} ${sportValue} ${leagueValue}`

  switch (channelId) {
    case RB_CHANNEL_IDS.sports:
      return matchesAny(combined, CATEGORY_KEYWORDS.sports)
    case RB_CHANNEL_IDS.arena:
      return matchesAny(combined, CATEGORY_KEYWORDS.arena)
    case RB_CHANNEL_IDS.women:
      return matchesAny(combined, CATEGORY_KEYWORDS.women)
    case RB_CHANNEL_IDS.combat:
      return matchesAny(combined, CATEGORY_KEYWORDS.combat)
    case RB_CHANNEL_IDS.cfb:
      return matchesAny(combined, CATEGORY_KEYWORDS.cfb)
    default:
      return true
  }
}

function resolveAllowedChannelId(
  channelIds: string[],
  sourceName: string | null,
  sport?: string | null,
  league?: string | null,
  storedChannelId?: string | null,
): string | null {
  if (storedChannelId && (channelIds.length === 0 || channelIds.includes(storedChannelId))) {
    return isAllowedSourceForChannel(storedChannelId, sourceName, sport, league) ? storedChannelId : null
  }

  const candidates = channelIds.length > 0 ? channelIds : Object.values(RB_CHANNEL_IDS)
  return candidates.find((channelId) => isAllowedSourceForChannel(channelId, sourceName, sport, league)) ?? null
}

function isLocalPath(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//')
}

function hasExtension(value: string, extensions: string[]): boolean {
  const path = isLocalPath(value) ? value : safeUrl(value)?.pathname ?? ''
  return extensions.some((extension) => path.toLowerCase().endsWith(extension))
}

function safeUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function isHttpUrl(value: string): boolean {
  const url = safeUrl(value)
  return url?.protocol === 'http:' || url?.protocol === 'https:'
}

function isDirectPlayableMedia(value: string): boolean {
  if (!value) return false
  if (isLocalPath(value)) return hasExtension(value, DIRECT_MEDIA_EXTENSIONS)

  const url = safeUrl(value)
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) return false

  if (hasExtension(value, DIRECT_MEDIA_EXTENSIONS)) return true
  if (url.hostname.includes('googlevideo.com') || url.pathname.includes('/videoplayback')) return true
  if (url.pathname.toLowerCase().endsWith('.m3u8')) return true

  const format = url.searchParams.get('format') || url.searchParams.get('fm')
  return Boolean(format && DIRECT_MEDIA_EXTENSIONS.includes(`.${format.toLowerCase()}`))
}

function isUsableThumbnail(value: string): boolean {
  if (!value) return false
  if (isLocalPath(value)) return true
  return isHttpUrl(value) && hasExtension(value, IMAGE_EXTENSIONS)
}

function normalizeAspectRatio(value: string | null): string | null {
  if (!value) return null

  const cleaned = value.replace(/\s+/g, '')
  return /^\d+:\d+$/.test(cleaned) ? cleaned : value
}

function validateImportClip(raw: ImportClipInput, index: number): {
  clip?: ValidImportClip
  error?: ImportClipValidationError
} {
  const errors: string[] = []
  const title = readString(raw.title)
  const channelId = readOptionalString(raw.channel_id)
  const hook = readString(raw.hook)
  const sourceName = readString(raw.source_name)
  const sourceType = readString(raw.source_type) || 'unknown'
  const thumbnailUrl = readString(raw.thumbnail_url)
  const videoUrl = readOptionalString(raw.video_url)
  const externalId = readOptionalString(raw.external_id)
  const sourceUrl = readOptionalString(raw.source_url)
  const originalPlatform = readOptionalString(raw.original_platform)
  const importBatchId = readOptionalString(raw.import_batch_id)
  const aspectRatio = normalizeAspectRatio(readOptionalString(raw.aspect_ratio))
  const durationSeconds = readNumber(raw.duration_seconds)
  const aiScore = readNumber(raw.ai_score) ?? 0
  const viralityScore = readNumber(raw.virality_score)
  const hookStrength = readNumber(raw.hook_strength)
  const geminiProcessedAt = readOptionalString(raw.gemini_processed_at)

  if (!title) errors.push('title is required')
  if (!hook) errors.push('hook is required')
  if (!sourceName) errors.push('source_name is required')
  if (videoUrl && !isDirectPlayableMedia(videoUrl)) {
    errors.push('video_url must be a direct playable media URL or local media path')
  }
  if (!thumbnailUrl) errors.push('thumbnail_url is required')
  if (thumbnailUrl && !isUsableThumbnail(thumbnailUrl)) {
    errors.push('thumbnail_url must be a direct image URL or local path')
  }
  if (durationSeconds === null || durationSeconds <= 0) {
    errors.push('duration_seconds must be greater than 0')
  } else if (durationSeconds > 60) {
    errors.push('duration_seconds must be 60 seconds or less')
  }
  if (aiScore < 0 || aiScore > 100) {
    errors.push('ai_score must be between 0 and 100')
  }
  if (viralityScore !== null && (viralityScore < 0 || viralityScore > 100)) {
    errors.push('virality_score must be between 0 and 100')
  }
  if (hookStrength !== null && (hookStrength < 0 || hookStrength > 100)) {
    errors.push('hook_strength must be between 0 and 100')
  }

  const dedupeKey = externalId || sourceUrl || videoUrl

  if (errors.length > 0) {
    return { error: { index, dedupe_key: dedupeKey || undefined, errors } }
  }

  return {
    clip: {
      channel_id: channelId,
      external_id: externalId,
      title,
      hook,
      source_name: sourceName,
      source_type: sourceType,
      thumbnail_url: thumbnailUrl,
      video_url: videoUrl,
      source_url: sourceUrl,
      original_platform: originalPlatform,
      import_batch_id: importBatchId,
      aspect_ratio: aspectRatio,
      duration_seconds: durationSeconds as number,
      ai_score: aiScore,
      virality_score: viralityScore,
      hook_strength: hookStrength,
      emotion: readOptionalString(raw.emotion),
      sports_category: readOptionalString(raw.sports_category),
      recommended_hook: readOptionalString(raw.recommended_hook),
      moderation_notes: readStringArray(raw.moderation_notes),
      risk_flags: readStringArray(raw.risk_flags),
      gemini_processed_at: geminiProcessedAt,
      sport: readOptionalString(raw.sport),
      league: readOptionalString(raw.league),
    },
  }
}

export async function getClips(input: GetClipsInput = {}): Promise<ModerationClip[]> {
  assertSupabaseQueue()

  const limit = Math.min(100, Math.max(1, input.limit ?? 60))
  const status = input.status ?? 'pending'
  const channelIds = normalizeChannelIds(input.channelIds)

  let query = supabaseAdmin
    .from('clips')
    .select(CLIP_SELECT)
    .eq('status', status)
    .neq('source_type', 'mock')
    .not('video_url', 'is', null)
    .order('ai_score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (channelIds.length > 0) {
    query = query.in('channel_id', channelIds)
  }

  if (input.sourceName?.trim()) {
    query = query.eq('source_name', input.sourceName.trim())
  }

  if (input.publishStatus) {
    query = query.eq('publish_status', input.publishStatus)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(error.message)
  }

  const seen = new Set<string>()
  const clips: ModerationClip[] = []

  for (const clip of ((data ?? []) as ClipRow[]).map(normalizeClip)) {
    const key = `${clip.channel_id ?? ''}\u0000${clip.external_id || clip.video_url || clip.id}`
    if (seen.has(key)) continue
    seen.add(key)
    clips.push(clip)
  }

  return clips
}

export async function getSources(input: { channelIds?: string[] } = {}): Promise<ModerationSource[]> {
  assertSupabaseQueue()
  const channelIds = normalizeChannelIds(input.channelIds)

  let fallbackQuery = supabaseAdmin
    .from('clips')
    .select('channel_id, source_name, source_type, ingested_at')
    .eq('status', 'pending')
    .neq('source_type', 'mock')
    .not('video_url', 'is', null)
    .order('source_name', { ascending: true })

  if (channelIds.length > 0) {
    fallbackQuery = fallbackQuery.in('channel_id', channelIds)
  }

  const { data, error } = await fallbackQuery

  if (error) throw new Error(error.message)

  const sources = new Map<string, ModerationSource>()

  for (const row of (data ?? []) as Array<{ channel_id: string | null; source_name: string | null; source_type: string | null; ingested_at: string | null }>) {
    const sourceName = row.source_name?.trim()
    if (!sourceName) continue
    const resolvedChannelId = row.channel_id
    if (!resolvedChannelId) continue

    const key = `${resolvedChannelId}\u0000${sourceName}`
    const current = sources.get(key)
    if (current) {
      current.pending_count += 1
      current.total_imported += 1
      if (row.ingested_at && (!current.last_ingested_at || row.ingested_at > current.last_ingested_at)) {
        current.last_ingested_at = row.ingested_at
        current.status = sourceStatus(row.ingested_at, current.pending_count)
      }
    } else {
      const lastIngestedAt = row.ingested_at ?? null
      sources.set(key, {
        channel_id: resolvedChannelId,
        source_name: sourceName,
        source_type: row.source_type?.trim() || 'unknown',
        pending_count: 1,
        total_imported: 1,
        last_ingested_at: lastIngestedAt,
        status: sourceStatus(lastIngestedAt, 1),
      })
    }
  }

  return [...sources.values()].sort((left, right) =>
    left.source_name.localeCompare(right.source_name),
  )
}

function sourceStatus(lastIngestedAt: string | null, pendingCount: number): ModerationSource['status'] {
  if (pendingCount <= 0) return 'empty'
  if (!lastIngestedAt) return 'active'

  const ageMs = Date.now() - new Date(lastIngestedAt).getTime()
  return Number.isFinite(ageMs) && ageMs > 1000 * 60 * 60 * 24 ? 'stale' : 'active'
}

export async function getClipById(clipId: string, input: GetClipByIdInput = {}): Promise<ModerationClip | null> {
  assertSupabaseQueue()
  const channelIds = normalizeChannelIds(input.channelIds)

  let query = supabaseAdmin
    .from('clips')
    .select(CLIP_SELECT)
    .eq('id', clipId)

  if (channelIds.length > 0) {
    query = query.in('channel_id', channelIds)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    return null
  }

  const clip = normalizeClip(data as ClipRow)
  if (input.includeMetricoolHandoffStatus === false) {
    return clip
  }

  const [hydrated] = await hydrateMetricoolHandoffStatuses([clip])
  return hydrated ?? clip
}

async function updateClipDecision(
  clipId: string,
  status: Extract<ClipModerationStatus, 'approved' | 'rejected' | 'skipped'>,
  input: { channelIds?: string[]; approvedBy?: string | null } = {},
): Promise<ModerationClip | null> {
  assertSupabaseQueue()
  const current = await getClipById(clipId, input)
  if (!current || (current.status !== 'pending' && current.status !== 'skipped')) {
    return null
  }

  const approvedAt = status === 'approved' ? new Date().toISOString() : null
  const hasRenderedAsset = clipHasRenderedAsset(current)
  const shouldQueueRender = status === 'approved' && !hasRenderedAsset
  const nextPublishStatus =
    status === 'approved'
      ? hasRenderedAsset
        ? 'metricool_ready_manual_export'
        : 'needs_clip_render'
    : 'not_ready'
  const patch: Record<string, unknown> = {
    status,
    publish_status: nextPublishStatus,
    approved_at: approvedAt,
    updated_at: new Date().toISOString(),
  }

  if (status === 'approved' && input.approvedBy) {
    patch.approved_by = input.approvedBy
  }

  let query = supabaseAdmin
    .from('clips')
    .update(patch)
    .eq('id', clipId)
    .in('status', ['pending', 'skipped'])

  let { data, error } = await query
    .select(CLIP_SELECT)
    .maybeSingle()

  if (error?.message.toLowerCase().includes('approved_by')) {
    ;({ data, error } = await supabaseAdmin
      .from('clips')
      .update({
        status,
        publish_status: nextPublishStatus,
        approved_at: approvedAt,
        updated_at: patch.updated_at,
      })
      .eq('id', clipId)
      .in('status', ['pending', 'skipped'])
      .select(CLIP_SELECT)
      .maybeSingle())
  }

  if (isPublishStatusConstraintError(error)) {
    ;({ data, error } = await supabaseAdmin
      .from('clips')
      .update({
        status,
        publish_status:
          status === 'approved' && hasRenderedAsset ? 'ready_for_manual_publish' : 'not_ready',
        approved_at: approvedAt,
        updated_at: patch.updated_at,
      })
      .eq('id', clipId)
      .in('status', ['pending', 'skipped'])
      .select(CLIP_SELECT)
      .maybeSingle())
  }

  if (error) {
    throw new Error(error.message)
  }

  if (!data) return null
  const updated = normalizeClip(data as ClipRow)
  updated.channel_id = current.channel_id

  if (status === 'approved') {
    if (!shouldQueueRender) {
      try {
        await enqueueRbhqPostJob({ postId: updated.id })
      } catch (error) {
        console.warn(
          '[rbhq-post] enqueue failed:',
          error instanceof Error ? error.message : error,
        )
      }
      return updated
    }

    return enqueueApprovedClipRender(updated, { requestedByUserId: input.approvedBy })
  }

  return updated
}

export function approveClip(
  clipId: string,
  input: { channelIds?: string[]; approvedBy?: string | null } = {},
): Promise<ModerationClip | null> {
  return updateClipDecision(clipId, 'approved', input)
}

export function rejectClip(clipId: string, input: { channelIds?: string[] } = {}): Promise<ModerationClip | null> {
  return updateClipDecision(clipId, 'rejected', input)
}

export function holdClip(clipId: string, input: { channelIds?: string[] } = {}): Promise<ModerationClip | null> {
  return updateClipDecision(clipId, 'skipped', input)
}

export async function getReadyPublishClips(input: { limit?: number; channelIds?: string[] } = {}): Promise<ModerationClip[]> {
  assertSupabaseQueue()
  const channelIds = normalizeChannelIds(input.channelIds)
  let query = supabaseAdmin
    .from('clips')
    .select(CLIP_SELECT)
    .eq('status', 'approved')
    .in('publish_status', ['metricool_ready_manual_export', 'ready_for_manual_publish'])
    .not('video_url', 'is', null)
    .order('approved_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 100)

  if (channelIds.length > 0) {
    query = query.in('channel_id', channelIds)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(error.message)
  }

  return ((data ?? []) as ClipRow[])
    .map(normalizeClip)
    .filter((clip) => isDownloadableMp4Url(clip.video_url))
}

export async function getMetricoolWorkflowClips(input: { limit?: number; channelIds?: string[] } = {}): Promise<ModerationClip[]> {
  assertSupabaseQueue()
  const channelIds = normalizeChannelIds(input.channelIds)
  let query = supabaseAdmin
    .from('clips')
    .select(CLIP_SELECT)
    .eq('status', 'approved')
    .in('publish_status', [...METRICOOL_WORKFLOW_PUBLISH_STATUSES])
    .not('video_url', 'is', null)
    .order('updated_at', { ascending: false })
    .order('approved_at', { ascending: false })
    .limit(input.limit ?? 100)

  if (channelIds.length > 0) {
    query = query.in('channel_id', channelIds)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(error.message)
  }

  const clips = ((data ?? []) as ClipRow[])
    .map(normalizeClip)
    .filter((clip) => isDownloadableMp4Url(clip.video_url))

  return hydrateMetricoolHandoffStatuses(clips)
}

export async function updateClipMetricoolStatus(
  clipId: string,
  input: {
    channelIds?: string[]
    publishStatus: Extract<ClipPublishStatus, 'metricool_scheduled' | 'metricool_published' | 'metricool_failed'>
    publishedAt?: string | null
    metricoolPostId?: string | null
  },
): Promise<ModerationClip | null> {
  assertSupabaseQueue()
  const current = await getClipById(clipId, {
    channelIds: input.channelIds,
    includeMetricoolHandoffStatus: false,
  })
  if (!current || current.status !== 'approved' || !isMetricoolExportReadyStatus(current.publish_status)) {
    return null
  }

  await persistMetricoolStatusHandoff(current, {
    publishStatus: input.publishStatus,
    metricoolPostId: input.metricoolPostId,
  })

  const patch: Record<string, unknown> = {
    publish_status: input.publishStatus,
    updated_at: new Date().toISOString(),
  }

  if (input.publishStatus === 'metricool_published') {
    patch.manually_published_at = input.publishedAt ?? new Date().toISOString()
  }

  let { data, error } = await supabaseAdmin
    .from('clips')
    .update(patch)
    .eq('id', clipId)
    .eq('status', 'approved')
    .in('publish_status', [...METRICOOL_READY_PUBLISH_STATUSES])
    .select(CLIP_SELECT)
    .maybeSingle()

  if (isPublishStatusConstraintError(error) && input.publishStatus === 'metricool_published') {
    ;({ data, error } = await supabaseAdmin
      .from('clips')
      .update({
        publish_status: 'manually_published',
        moderation_notes: withMetricoolStatusNote(current.moderation_notes, input.publishStatus),
        manually_published_at: patch.manually_published_at,
        updated_at: patch.updated_at,
      })
      .eq('id', clipId)
      .eq('status', 'approved')
      .in('publish_status', [...METRICOOL_READY_PUBLISH_STATUSES])
      .select(CLIP_SELECT)
      .maybeSingle())
  }

  if (isPublishStatusConstraintError(error) && input.publishStatus !== 'metricool_published') {
    ;({ data, error } = await supabaseAdmin
      .from('clips')
      .update({
        moderation_notes: withMetricoolStatusNote(current.moderation_notes, input.publishStatus),
        updated_at: patch.updated_at,
      })
      .eq('id', clipId)
      .eq('status', 'approved')
      .in('publish_status', [...METRICOOL_READY_PUBLISH_STATUSES])
      .select(CLIP_SELECT)
      .maybeSingle())
  }

  if (error) {
    throw new Error(error.message)
  }

  if (!data) return null
  const updated = normalizeClip(data as ClipRow)
  updated.channel_id = current.channel_id
  return updated
}

export async function markClipMetricoolPublished(clipId: string, input: { channelIds?: string[] } = {}): Promise<ModerationClip | null> {
  assertSupabaseQueue()
  const current = await getClipById(clipId, input)
  if (!current || current.status !== 'approved') {
    return null
  }

  if (isMetricoolExportedStatus(current.publish_status)) {
    return current
  }

  if (
    !isMetricoolExportReadyStatus(current.publish_status) &&
    current.publish_status !== 'manually_published'
  ) {
    return null
  }

  if (!isDownloadableMp4Url(current.video_url)) {
    return null
  }

  const publishedAt = current.manually_published_at ?? new Date().toISOString()
  let { data, error } = await supabaseAdmin
    .from('clips')
    .update({
      publish_status: 'metricool_published',
      manually_published_at: publishedAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', clipId)
    .eq('status', 'approved')
    .in('publish_status', [...METRICOOL_READY_PUBLISH_STATUSES])
    .select(CLIP_SELECT)
    .maybeSingle()

  if (isPublishStatusConstraintError(error)) {
    ;({ data, error } = await supabaseAdmin
      .from('clips')
      .update({
        publish_status: 'manually_published',
        manually_published_at: publishedAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', clipId)
      .eq('status', 'approved')
      .in('publish_status', [...METRICOOL_READY_PUBLISH_STATUSES])
      .select(CLIP_SELECT)
      .maybeSingle())
  }

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    const fresh = await getClipById(clipId, input)
    if (fresh && isMetricoolExportedStatus(fresh.publish_status)) {
      return fresh
    }

    return null
  }

  const updated = normalizeClip(data as ClipRow)
  updated.channel_id = current.channel_id
  return updated
}

export async function markClipManuallyPublished(clipId: string, input: { channelIds?: string[] } = {}): Promise<ModerationClip | null> {
  return markClipMetricoolPublished(clipId, input)
}

export async function getNextPendingClip(input: {
  channelIds?: string[]
  excludeId?: string | null
  sourceName?: string | null
} = {}): Promise<ModerationClip | null> {
  const clips = await getClips({
    limit: input.excludeId ? 2 : 1,
    channelIds: input.channelIds,
    sourceName: input.sourceName,
    status: 'pending',
  })

  return clips.find((clip) => clip.id !== input.excludeId) ?? null
}

export async function importClips(input: {
  clips: ImportClipInput[]
  channelId?: string | null
  importBatchId?: string | null
}): Promise<ImportClipResult> {
  assertSupabaseQueue()

  const validationErrors: ImportClipValidationError[] = []
  const skipped: ImportClipResult['skipped'] = []
  const inserted: ModerationClip[] = []
  const seenInBatch = new Set<string>()
  const candidates: Array<{ index: number; clip: ValidImportClip; dedupeKey: string }> = []

  input.clips.forEach((rawClip, index) => {
    const { clip, error } = validateImportClip(
      {
        ...rawClip,
        channel_id: readOptionalString(rawClip.channel_id) ?? input.channelId ?? null,
        import_batch_id: readOptionalString(rawClip.import_batch_id) ?? input.importBatchId ?? null,
      },
      index,
    )

    if (error) {
      validationErrors.push(error)
      return
    }

    if (!clip) return

    const dedupeKey = clip.external_id || clip.source_url || clip.video_url || ''
    if (!dedupeKey) {
      validationErrors.push({ index, errors: ['external_id, source_url, or video_url is required'] })
      return
    }
    const batchKey = `${clip.channel_id ?? ''}\u0000${dedupeKey}`
    const duplicateTitle = candidates.some((candidate) =>
      titleSimilarity(candidate.clip.title, clip.title) >= loadSourceSystemConfig().duplicateRules.title_similarity_threshold,
    )
    if (duplicateTitle) {
      skipped.push({ index, dedupe_key: dedupeKey, reason: 'duplicate_title_in_batch' })
      return
    }

    if (seenInBatch.has(batchKey)) {
      skipped.push({ index, dedupe_key: dedupeKey, reason: 'duplicate_in_batch' })
      return
    }

    seenInBatch.add(batchKey)
    candidates.push({ index, clip, dedupeKey })
  })

  if (candidates.length === 0) {
    return {
      inserted_count: 0,
      skipped_count: skipped.length,
      failed_count: validationErrors.length,
      validation_errors: validationErrors,
      inserted,
      skipped,
    }
  }

  const externalIds = candidates
    .map((candidate) => candidate.clip.external_id)
    .filter((value): value is string => Boolean(value))
  const videoUrls = candidates
    .map((candidate) => candidate.clip.video_url)
    .filter((value): value is string => Boolean(value))
  const candidateChannelIds = normalizeChannelIds(candidates.map((candidate) => candidate.clip.channel_id ?? ''))
  const duplicateKeys = new Set<string>()

  if (externalIds.length > 0) {
    const query = supabaseAdmin
      .from('clips')
      .select('external_id')
      .in('external_id', externalIds)

    const { data, error } = await query

    if (error) throw new Error(error.message)

    for (const row of (data ?? []) as Array<{ external_id: string | null }>) {
      if (row.external_id) {
        for (const channelId of candidateChannelIds.length > 0 ? candidateChannelIds : ['']) {
          duplicateKeys.add(`${channelId}\u0000${row.external_id}`)
        }
      }
    }
  }

  let existingVideos: Array<{ video_url: string | null }> | null = []
  if (videoUrls.length > 0) {
    const { data, error: videoError } = await supabaseAdmin
      .from('clips')
      .select('video_url')
      .in('video_url', videoUrls)

    if (videoError) throw new Error(videoError.message)
    existingVideos = (data ?? []) as Array<{ video_url: string | null }>
  }

  for (const row of (existingVideos ?? []) as Array<{ video_url: string | null }>) {
    if (row.video_url) {
      for (const channelId of candidateChannelIds.length > 0 ? candidateChannelIds : ['']) {
        duplicateKeys.add(`${channelId}\u0000${row.video_url}`)
      }
    }
  }

  const rowsToInsert = candidates
    .filter((candidate) => {
      const channelPrefix = `${candidate.clip.channel_id ?? ''}\u0000`
      if (
        duplicateKeys.has(`${channelPrefix}${candidate.dedupeKey}`) ||
        (candidate.clip.video_url && duplicateKeys.has(`${channelPrefix}${candidate.clip.video_url}`))
      ) {
        skipped.push({
          index: candidate.index,
          dedupe_key: candidate.dedupeKey,
          reason: 'duplicate_existing_clip',
        })
        return false
      }

      return true
    })
    .map(({ clip }) => ({
      ...clip,
      status: 'pending' as const,
      publish_status: 'not_ready' as const,
    }))

  if (rowsToInsert.length > 0) {
    const sourceKeys = new Map<string, { channel_id: string | null; source_name: string; source_type: string; source_url: string | null; original_platform: string | null }>()
    for (const row of rowsToInsert) {
      const key = `${row.channel_id ?? ''}\u0000${row.source_name}\u0000${row.source_type}`
      sourceKeys.set(key, {
        channel_id: row.channel_id,
        source_name: row.source_name,
        source_type: row.source_type,
        source_url: row.source_url,
        original_platform: row.original_platform,
      })
    }

    const { data: sourceRows, error: sourceError } = await supabaseAdmin
      .from('clip_sources')
      .upsert([...sourceKeys.values()], { onConflict: 'channel_id,source_name,source_type' })
      .select('id, channel_id, source_name, source_type')

    if (sourceError && !sourceError.message.includes('clip_sources')) {
      throw new Error(sourceError.message)
    }

    if (!sourceError) {
      const sourceIds = new Map(
        ((sourceRows ?? []) as Array<{ id: string; channel_id: string | null; source_name: string; source_type: string }>).map((source) => [
          `${source.channel_id ?? ''}\u0000${source.source_name}\u0000${source.source_type}`,
          source.id,
        ]),
      )

      for (const row of rowsToInsert) {
        row.source_id = sourceIds.get(`${row.channel_id ?? ''}\u0000${row.source_name}\u0000${row.source_type}`) ?? null
      }
    }

    const insertPayloadWithoutChannel = rowsToInsert.map((row) => {
      const { channel_id, ...withoutChannel } = row
      void channel_id
      return withoutChannel
    })

    let { data, error } = await supabaseAdmin
      .from('clips')
      .insert(rowsToInsert)
      .select(CLIP_SELECT)

    if (isMissingColumnError(error)) {
      const fallback = await supabaseAdmin
        .from('clips')
        .insert(insertPayloadWithoutChannel)
        .select(CLIP_SELECT)
      data = fallback.data
      error = fallback.error
    }

    if (error) throw new Error(error.message)

    inserted.push(...((data ?? []) as ClipRow[]).map(normalizeClip))
  }

  return {
    inserted_count: inserted.length,
    skipped_count: skipped.length,
    failed_count: validationErrors.length,
    validation_errors: validationErrors,
    inserted,
    skipped,
  }
}
