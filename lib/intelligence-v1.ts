import { getChannelMeta } from './channel-meta'
import {
  getStoredTikTokAnalysis,
  type TikTokAnalyzerOutput,
  type TikTokReasonTag,
} from './tiktok-analyzer'

export type RBHQIntelligenceRankLabel = 'must_post' | 'strong' | 'solid' | 'low_priority'
export type RBHQIntelligenceUrgency = 'post_now' | 'today' | 'evergreen' | 'hold'

export type RBHQIntelligenceV1 = {
  score: number
  rankLabel: RBHQIntelligenceRankLabel
  urgency: RBHQIntelligenceUrgency
  reasons: string[]
  suggestedCaption: string
  suggestedHashtags: string[]
  hook: string
  operatorSummary: string
  whyNow: string
}

export type RBHQIntelligenceInput = {
  id?: string | null
  channel_id?: string | null
  title?: string | null
  hook?: string | null
  source_title?: string | null
  source_name?: string | null
  source_type?: string | null
  description?: string | null
  transcript?: string | null
  text?: string | null
  sport?: string | null
  league?: string | null
  duration_seconds?: number | null
  ai_score?: number | null
  virality_score?: number | null
  hook_strength?: number | null
  emotion?: string | null
  recommended_hook?: string | null
  risk_flags?: string[] | null
  moderation_notes?: string[] | null
  created_at?: string | null
  updated_at?: string | null
  approved_at?: string | null
  published_at?: string | null
  analyzer?: TikTokAnalyzerOutput | null
}

export type DailyContentPlanClip = {
  id: string | null
  title: string
  channelId: string | null
  lane: string
  sourceName: string | null
  score: number
  rankLabel: RBHQIntelligenceRankLabel
  urgency: RBHQIntelligenceUrgency
  whyNow: string
  operatorSummary: string
  suggestedCaption: string
  suggestedHashtags: string[]
  status?: string | null
  publishStatus?: string | null
  createdAt?: string | null
}

export type DailyContentPlan = {
  generatedAt: string
  topClipsToPostNow: DailyContentPlanClip[]
  strongAlternates: DailyContentPlanClip[]
  holdOrLowPriority: DailyContentPlanClip[]
  laneBalanceNotes: string[]
  suggestedPostingOrder: DailyContentPlanClip[]
}

export const RBHQ_INTELLIGENCE_V1_NOTE_PREFIX = 'rbhq_intelligence_v1:'

const EDITORIAL_CAPTION_PREFIX = 'editorial_caption:'
const EDITORIAL_HASHTAGS_PREFIX = 'editorial_hashtags:'
const CANDIDATE_CAPTION_PREFIX = 'candidate_caption:'
const CANDIDATE_HASHTAGS_PREFIX = 'candidate_hashtags:'
const MAX_REASON_COUNT = 6

const EVENT_PATTERNS = [
  'breaking',
  'just in',
  'trade',
  'traded',
  'signed',
  'fired',
  'upset',
  'stunner',
  'injury',
  'injured',
  'debut',
  'rookie',
  'rivalry',
  'rival',
  'beef',
  'trash talk',
  'heated',
  'controversy',
  'controversial',
  'clutch',
  'walkoff',
  'walk-off',
  'comeback',
  'reaction',
  'reacts',
  'viral',
  'rage',
  'nerf',
  'patch',
  'reveal',
  'trailer',
  'tournament',
]

const EMOTIONAL_PATTERNS = [
  'insane',
  'wild',
  'crazy',
  'stunned',
  'shocked',
  'erupts',
  'goes crazy',
  'called out',
  'disrespect',
  'heated',
  'pressure',
  'clutch',
]

const SIGNAL_CATEGORIES = [
  {
    label: 'breaking/news',
    caption: 'breaking reaction',
    hashtags: ['#Breaking', '#News'],
    patterns: ['breaking', 'just in'],
  },
  {
    label: 'trade/roster',
    caption: 'trade reaction',
    hashtags: ['#TradeTalk', '#RosterMoves'],
    patterns: ['trade', 'traded', 'signed', 'fired'],
  },
  {
    label: 'injury update',
    caption: 'injury update',
    hashtags: ['#InjuryUpdate'],
    patterns: ['injury', 'injured'],
  },
  {
    label: 'clutch/upset',
    caption: 'clutch upset',
    hashtags: ['#Clutch', '#Upset'],
    patterns: ['upset', 'stunner', 'clutch', 'walkoff', 'walk-off', 'comeback'],
  },
  {
    label: 'rivalry/conflict',
    caption: 'rivalry reaction',
    hashtags: ['#Rivalry', '#Reaction'],
    patterns: ['rivalry', 'rival', 'beef', 'trash talk', 'heated', 'controversy', 'controversial'],
  },
  {
    label: 'fan reaction',
    caption: 'fan reaction',
    hashtags: ['#FanReaction', '#Reaction'],
    patterns: ['reaction', 'reacts', 'viral', 'rage'],
  },
  {
    label: 'gaming update',
    caption: 'patch reaction',
    hashtags: ['#PatchNotes', '#GamingNews'],
    patterns: ['nerf', 'patch', 'reveal', 'trailer', 'tournament'],
  },
]

function compact(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

function truncate(value: string, max: number): string {
  const clean = compact(value)
  return clean.length <= max ? clean : `${clean.slice(0, max - 3).trim()}...`
}

function sentenceLead(value: string): string {
  const clean = compact(value)
  if (!clean) return ''
  return /[.!?]$/.test(clean) ? clean : `${clean}.`
}

function sentenceCase(value: string): string {
  const clean = compact(value)
  return clean ? `${clean.charAt(0).toUpperCase()}${clean.slice(1)}` : ''
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)))
}

function normalizeTag(value: string): string {
  const clean = value.trim()
  if (!clean) return ''
  const body = clean
    .replace(/^#+/, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
  return body ? `#${body}` : ''
}

function uniqueHashtags(values: string[]): string[] {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const value of values) {
    const tag = normalizeTag(value)
    if (!tag) continue
    const normalized = tag.toLowerCase()
    if (seen.has(normalized)) continue
    seen.add(normalized)
    tags.push(tag)
    if (tags.length >= 6) break
  }
  return tags
}

function readJsonNote<T>(notes: string[] | null | undefined, prefix: string): T | null {
  const note = notes?.find((item) => item.startsWith(prefix))
  if (!note) return null

  try {
    return JSON.parse(note.slice(prefix.length)) as T
  } catch {
    return null
  }
}

function readTextNote(notes: string[] | null | undefined, prefix: string): string | null {
  const value = notes?.find((item) => item.startsWith(prefix))?.slice(prefix.length)
  return compact(value) || null
}

function readTextArrayNote(notes: string[] | null | undefined, prefix: string): string[] | null {
  const value = readTextNote(notes, prefix)
  if (!value) return null
  return value.split(/\s+/).map((item) => item.trim()).filter(Boolean)
}

function storedCaption(input: RBHQIntelligenceInput): string | null {
  return (
    readJsonNote<string>(input.moderation_notes, EDITORIAL_CAPTION_PREFIX) ??
    readTextNote(input.moderation_notes, CANDIDATE_CAPTION_PREFIX)
  )
}

function storedHashtags(input: RBHQIntelligenceInput): string[] | null {
  return (
    readJsonNote<string[]>(input.moderation_notes, EDITORIAL_HASHTAGS_PREFIX) ??
    readTextArrayNote(input.moderation_notes, CANDIDATE_HASHTAGS_PREFIX)
  )
}

function laneLabel(input: RBHQIntelligenceInput): string {
  const meta = input.channel_id ? getChannelMeta(input.channel_id) : null
  return meta?.label ?? (compact(input.league || input.sport) || 'RBHQ')
}

function laneSlug(input: RBHQIntelligenceInput): string {
  const meta = input.channel_id ? getChannelMeta(input.channel_id) : null
  return meta?.slug ?? 'sports'
}

function textForSignals(input: RBHQIntelligenceInput): string {
  const notes = (input.moderation_notes ?? [])
    .filter((note) =>
      !note.startsWith(RBHQ_INTELLIGENCE_V1_NOTE_PREFIX) &&
      !note.startsWith('tiktok_analyzer_v1:') &&
      !note.startsWith(EDITORIAL_CAPTION_PREFIX) &&
      !note.startsWith(EDITORIAL_HASHTAGS_PREFIX),
    )
    .join(' ')

  return [
    input.title,
    input.source_title,
    input.hook,
    input.recommended_hook,
    input.source_name,
    input.description,
    input.transcript,
    input.text,
    input.sport,
    input.league,
    input.emotion,
    notes,
    ...(input.risk_flags ?? []),
  ].map(compact).join(' ').toLowerCase()
}

function countPatternHits(text: string, patterns: string[]): number {
  return patterns.filter((pattern) => text.includes(pattern)).length
}

function detectedSignals(text: string) {
  return SIGNAL_CATEGORIES.filter((category) => countPatternHits(text, category.patterns) > 0)
}

function signalSummary(text: string): string {
  const labels = detectedSignals(text).map((signal) => signal.label)
  return labels.length > 0 ? labels.slice(0, 2).join(' + ') : 'story'
}

function signalHashtags(text: string): string[] {
  return detectedSignals(text)
    .map((signal) => signal.hashtags[0])
    .filter((tag): tag is string => Boolean(tag))
    .slice(0, 2)
}

function formatUrgency(value: RBHQIntelligenceUrgency): string {
  if (value === 'post_now') return 'post now'
  if (value === 'today') return 'review today'
  if (value === 'evergreen') return 'evergreen'
  return 'hold'
}

function hasAnalyzerTag(analyzer: TikTokAnalyzerOutput | null | undefined, tag: TikTokReasonTag): boolean {
  return analyzer?.reasonTags.includes(tag) ?? false
}

function recencyHours(input: RBHQIntelligenceInput): number | null {
  const value = input.published_at ?? input.created_at ?? input.updated_at ?? input.approved_at
  if (!value) return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, (Date.now() - parsed) / 3_600_000)
}

function baseScore(input: RBHQIntelligenceInput, analyzer: TikTokAnalyzerOutput | null): number {
  const ai = typeof input.ai_score === 'number' ? input.ai_score : null
  const virality = typeof input.virality_score === 'number' ? input.virality_score : null
  const hook = typeof input.hook_strength === 'number' ? input.hook_strength : null
  const analyzerScore = analyzer?.priorityScore ?? null

  let score = analyzerScore ?? ai ?? 56
  if (virality !== null) score = score * 0.68 + virality * 0.32
  if (hook !== null) score = score * 0.78 + hook * 0.22

  const duration = input.duration_seconds
  if (typeof duration === 'number' && duration > 0 && duration <= 24) score += 3
  if (typeof duration === 'number' && duration > 50) score -= 4

  return score
}

function rankForScore(score: number, urgency: RBHQIntelligenceUrgency): RBHQIntelligenceRankLabel {
  if (score >= 88 || (urgency === 'post_now' && score >= 82)) return 'must_post'
  if (score >= 76) return 'strong'
  if (score >= 58) return 'solid'
  return 'low_priority'
}

function urgencyForInput(input: RBHQIntelligenceInput, analyzer: TikTokAnalyzerOutput | null, score: number): RBHQIntelligenceUrgency {
  const text = textForSignals(input)
  const eventHits = countPatternHits(text, EVENT_PATTERNS)
  const hours = recencyHours(input)
  const blocked =
    score < 45 ||
    hasAnalyzerTag(analyzer, 'wrong_format') ||
    hasAnalyzerTag(analyzer, 'low_quality') ||
    (input.risk_flags ?? []).some((flag) => /wrong_format|low_quality|blocked/i.test(flag))

  if (blocked) return 'hold'
  if (
    hasAnalyzerTag(analyzer, 'breaking') ||
    hasAnalyzerTag(analyzer, 'injury') ||
    (eventHits >= 2 && (hours === null || hours <= 12)) ||
    (hours !== null && hours <= 3 && eventHits > 0)
  ) {
    return 'post_now'
  }
  if (
    hasAnalyzerTag(analyzer, 'rivalry') ||
    hasAnalyzerTag(analyzer, 'controversy') ||
    hasAnalyzerTag(analyzer, 'fan_reaction') ||
    eventHits > 0 ||
    (hours !== null && hours <= 24)
  ) {
    return 'today'
  }
  return 'evergreen'
}

function buildHook(input: RBHQIntelligenceInput, analyzer: TikTokAnalyzerOutput | null): string {
  return truncate(
    analyzer?.hookLine ||
      input.recommended_hook ||
      input.hook ||
      input.title ||
      'This clip has a clean TikTok angle',
    110,
  )
}

function buildCaption(input: RBHQIntelligenceInput, analyzer: TikTokAnalyzerOutput | null, hook: string): string {
  const saved = storedCaption(input)
  if (saved) return truncate(saved, 180)
  if (analyzer?.captionDraft) return truncate(analyzer.captionDraft, 180)

  const text = textForSignals(input)
  const context = compact(input.league || input.sport)
  const signal = detectedSignals(text)[0]
  const topic = sentenceCase(compact([context, signal?.caption].filter(Boolean).join(' ')) || 'this clip')
  const lane = laneSlug(input)
  const laneClose =
    lane === 'arena'
      ? 'the gaming timeline is ready to argue.'
      : lane === 'combat'
        ? 'fight fans will have a take.'
        : 'the timeline has a take right now.'

  return truncate(`${sentenceLead(hook)} ${topic} is why ${laneClose}`, 180)
}

function buildHashtags(input: RBHQIntelligenceInput, analyzer: TikTokAnalyzerOutput | null): string[] {
  const saved = storedHashtags(input)
  if (saved && saved.length > 0) return uniqueHashtags(saved)
  if (analyzer?.hashtagPack?.length) return uniqueHashtags(analyzer.hashtagPack)

  const laneTags: Record<string, string[]> = {
    sports: ['#Sports', '#RunnitBack', '#Highlights'],
    arena: ['#Gaming', '#Esports', '#RunnitBackGaming'],
    futbol: ['#Futbol', '#Soccer', '#RunnitBack'],
    runnitbackcfb: ['#CollegeFootball', '#CFB', '#RunnitBack'],
    women: ['#WomensSports', '#Highlights', '#RunnitBack'],
    combat: ['#UFC', '#MMA', '#FightNight'],
  }
  const text = textForSignals(input)

  return uniqueHashtags([
    input.league ? `#${input.league}` : '',
    input.sport ? `#${input.sport}` : '',
    ...signalHashtags(text),
    ...(laneTags[laneSlug(input)] ?? laneTags.sports),
  ])
}

function reasonLines(input: RBHQIntelligenceInput, analyzer: TikTokAnalyzerOutput | null, score: number): string[] {
  const text = textForSignals(input)
  const reasons: string[] = []
  const hours = recencyHours(input)
  const eventHits = countPatternHits(text, EVENT_PATTERNS)
  const emotionalHits = countPatternHits(text, EMOTIONAL_PATTERNS)

  const signals = signalSummary(text)

  if (eventHits > 0) reasons.push(`Story signal is specific: ${signals}.`)
  if (emotionalHits > 0 || hasAnalyzerTag(analyzer, 'controversy') || hasAnalyzerTag(analyzer, 'rivalry')) {
    reasons.push('Emotional or conflict signal should help comments.')
  }
  if (hours !== null && hours <= 24) {
    reasons.push(hours <= 3 ? 'Fresh clip: imported in the last 3 hours.' : 'Recent clip: still useful for today.')
  }
  if (analyzer?.reasonTags.length) {
    reasons.push(`Analyzer tags: ${analyzer.reasonTags.slice(0, 3).map((tag) => tag.replace(/_/g, ' ')).join(', ')}.`)
  }
  if (compact(input.hook || input.recommended_hook || analyzer?.hookLine).length >= 18) {
    reasons.push('Hook is clear enough to caption quickly.')
  }
  if (storedCaption(input) || storedHashtags(input)?.length) {
    reasons.push('Saved editorial caption or hashtags are already available.')
  }
  if (laneSlug(input) === 'arena') {
    reasons.push('Gaming lane fit favors speed while the clip is still current.')
  }
  if (score < 58) reasons.push('Score is below the main operator priority band.')

  return reasons.slice(0, MAX_REASON_COUNT)
}

function whyNowForInput(input: RBHQIntelligenceInput, analyzer: TikTokAnalyzerOutput | null, urgency: RBHQIntelligenceUrgency): string {
  if (analyzer?.whyNow && urgency !== 'evergreen') return truncate(analyzer.whyNow, 180)
  const text = textForSignals(input)
  const signals = signalSummary(text)
  const hours = recencyHours(input)
  const recency = hours === null ? '' : hours <= 3 ? ' and it is fresh' : hours <= 24 ? ' and still timely' : ''
  if (urgency === 'post_now') return `${laneLabel(input)} has ${signals} momentum${recency}; post before the conversation cools.`
  if (urgency === 'today') return `${laneLabel(input)} has a ${signals} angle${recency}; review it while the lane is still active.`
  if (urgency === 'hold') return 'Hold until the format, quality, or story signal is stronger.'
  return 'Evergreen angle: useful as a fill-in when higher-urgency clips are thin.'
}

function operatorSummaryForInput(
  input: RBHQIntelligenceInput,
  analyzer: TikTokAnalyzerOutput | null,
  score: number,
  rankLabel: RBHQIntelligenceRankLabel,
): string {
  if (analyzer?.operatorSummary) return truncate(analyzer.operatorSummary, 180)
  const source = compact(input.source_name) || 'source'
  const signal = signalSummary(textForSignals(input))
  return `${laneLabel(input)}: ${source} clip is ${rankLabel.replace(/_/g, ' ')} at ${score}/100 with a ${signal} angle; ${formatUrgency(urgencyForInput(input, analyzer, score))}.`
}

export function adaptTikTokAnalysisToRBHQIntelligenceV1(
  input: RBHQIntelligenceInput,
  analyzer: TikTokAnalyzerOutput,
): RBHQIntelligenceV1 {
  return buildRBHQIntelligenceV1({ ...input, analyzer })
}

export function buildRBHQIntelligenceV1(input: RBHQIntelligenceInput): RBHQIntelligenceV1 {
  const analyzer = input.analyzer ?? getStoredTikTokAnalysis(input.moderation_notes)
  const text = textForSignals(input)
  const scoreBoost =
    Math.min(8, countPatternHits(text, EVENT_PATTERNS) * 2) +
    Math.min(6, countPatternHits(text, EMOTIONAL_PATTERNS) * 2)
  const urgencyProbeScore = clampScore(baseScore(input, analyzer) + scoreBoost)
  const urgency = urgencyForInput(input, analyzer, urgencyProbeScore)
  const score = urgency === 'hold' ? Math.min(urgencyProbeScore, 62) : urgencyProbeScore
  const rankLabel = urgency === 'hold' ? 'low_priority' : rankForScore(score, urgency)
  const hook = buildHook(input, analyzer)

  return {
    score,
    rankLabel,
    urgency,
    reasons: reasonLines(input, analyzer, score),
    suggestedCaption: buildCaption(input, analyzer, hook),
    suggestedHashtags: buildHashtags(input, analyzer),
    hook,
    operatorSummary: operatorSummaryForInput(input, analyzer, score, rankLabel),
    whyNow: whyNowForInput(input, analyzer, urgency),
  }
}

function normalizeRankLabel(value: unknown): RBHQIntelligenceRankLabel {
  if (value === 'must_post' || value === 'strong' || value === 'solid' || value === 'low_priority') {
    return value
  }
  return 'low_priority'
}

function normalizeUrgency(value: unknown): RBHQIntelligenceUrgency {
  if (value === 'post_now' || value === 'today' || value === 'evergreen' || value === 'hold') {
    return value
  }
  return 'hold'
}

function parseIntelligenceCandidate(value: unknown): RBHQIntelligenceV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Partial<RBHQIntelligenceV1>

  return {
    score: clampScore(Number(candidate.score ?? 0)),
    rankLabel: normalizeRankLabel(candidate.rankLabel),
    urgency: normalizeUrgency(candidate.urgency),
    reasons: Array.isArray(candidate.reasons)
      ? candidate.reasons.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, MAX_REASON_COUNT)
      : [],
    suggestedCaption: truncate(compact(candidate.suggestedCaption), 180),
    suggestedHashtags: Array.isArray(candidate.suggestedHashtags)
      ? uniqueHashtags(candidate.suggestedHashtags.filter((item): item is string => typeof item === 'string'))
      : [],
    hook: truncate(compact(candidate.hook), 110),
    operatorSummary: truncate(compact(candidate.operatorSummary), 180),
    whyNow: truncate(compact(candidate.whyNow), 180),
  }
}

export function getStoredRBHQIntelligenceV1(notes: string[] | null | undefined): RBHQIntelligenceV1 | null {
  const note = notes?.find((item) => item.startsWith(RBHQ_INTELLIGENCE_V1_NOTE_PREFIX))
  if (!note) return null

  try {
    return parseIntelligenceCandidate(JSON.parse(note.slice(RBHQ_INTELLIGENCE_V1_NOTE_PREFIX.length)))
  } catch {
    return null
  }
}

export function withStoredRBHQIntelligenceV1(notes: string[], intelligence: RBHQIntelligenceV1): string[] {
  return [
    ...notes.filter((note) => !note.startsWith(RBHQ_INTELLIGENCE_V1_NOTE_PREFIX)),
    `${RBHQ_INTELLIGENCE_V1_NOTE_PREFIX}${JSON.stringify(intelligence)}`,
  ]
}

export function getRBHQIntelligenceV1(input: RBHQIntelligenceInput): RBHQIntelligenceV1 {
  return getStoredRBHQIntelligenceV1(input.moderation_notes) ?? buildRBHQIntelligenceV1(input)
}

function toPlanClip(input: RBHQIntelligenceInput & {
  status?: string | null
  publish_status?: string | null
}): DailyContentPlanClip {
  const intelligence = getRBHQIntelligenceV1(input)
  return {
    id: input.id ?? null,
    title: compact(input.title || input.hook) || 'Untitled clip',
    channelId: input.channel_id ?? null,
    lane: laneLabel(input),
    sourceName: input.source_name ?? null,
    score: intelligence.score,
    rankLabel: intelligence.rankLabel,
    urgency: intelligence.urgency,
    whyNow: intelligence.whyNow,
    operatorSummary: intelligence.operatorSummary,
    suggestedCaption: intelligence.suggestedCaption,
    suggestedHashtags: intelligence.suggestedHashtags,
    status: input.status ?? null,
    publishStatus: input.publish_status ?? null,
    createdAt: input.created_at ?? null,
  }
}

function byPriority(left: DailyContentPlanClip, right: DailyContentPlanClip): number {
  const urgencyOrder: Record<RBHQIntelligenceUrgency, number> = {
    post_now: 0,
    today: 1,
    evergreen: 2,
    hold: 3,
  }
  const urgencyDelta = urgencyOrder[left.urgency] - urgencyOrder[right.urgency]
  if (urgencyDelta !== 0) return urgencyDelta
  return right.score - left.score
}

export function buildDailyContentPlan<T extends RBHQIntelligenceInput & {
  status?: string | null
  publish_status?: string | null
}>(clips: T[]): DailyContentPlan {
  const planClips = clips.map(toPlanClip).sort(byPriority)
  const topClipsToPostNow = planClips
    .filter((clip) => clip.urgency === 'post_now' || clip.rankLabel === 'must_post')
    .slice(0, 6)
  const strongAlternates = planClips
    .filter((clip) =>
      !topClipsToPostNow.some((topClip) => topClip.id === clip.id) &&
      (clip.rankLabel === 'strong' || (clip.rankLabel === 'solid' && clip.urgency !== 'hold')),
    )
    .slice(0, 10)
  const holdOrLowPriority = planClips
    .filter((clip) => clip.urgency === 'hold' || clip.rankLabel === 'low_priority')
    .slice(0, 10)
  const suggestedPostingOrder = [...topClipsToPostNow, ...strongAlternates].sort(byPriority).slice(0, 12)
  const lanes = new Map<string, number>()
  for (const clip of [...topClipsToPostNow, ...strongAlternates]) {
    lanes.set(clip.lane, (lanes.get(clip.lane) ?? 0) + 1)
  }
  const laneBalanceNotesBase =
    lanes.size === 0
      ? ['No high-priority clips are available in the current lane set.']
      : [...lanes.entries()]
          .sort((left, right) => right[1] - left[1])
          .map(([lane, count]) => `${lane}: ${count} priority clip${count === 1 ? '' : 's'} available.`)
  const leadClip = suggestedPostingOrder[0]
  const laneBalanceNotes = leadClip
    ? [
        ...laneBalanceNotesBase,
        `Lead with ${truncate(leadClip.title, 72)} from ${leadClip.lane} (${leadClip.score}/100, ${formatUrgency(leadClip.urgency)}).`,
      ]
    : laneBalanceNotesBase

  return {
    generatedAt: new Date().toISOString(),
    topClipsToPostNow,
    strongAlternates,
    holdOrLowPriority,
    laneBalanceNotes,
    suggestedPostingOrder,
  }
}
