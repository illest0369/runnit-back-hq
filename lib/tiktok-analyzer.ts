import { getChannelMeta } from './channel-meta'
import { generateGeminiJson } from './gemini/client'

export type TikTokRankLabel = 'Hot' | 'Solid' | 'Hold' | 'Reject'
export type TikTokConfidence = 'low' | 'medium' | 'high'
export type TikTokReasonTag =
  | 'breaking'
  | 'rivalry'
  | 'star_player'
  | 'controversy'
  | 'fan_reaction'
  | 'highlight'
  | 'debut'
  | 'injury'
  | 'championship'
  | 'viral_audio_fit'
  | 'low_quality'
  | 'wrong_format'
export type VerticalStatus = 'vertical_ready' | 'needs_resize' | 'blocked_wrong_format' | 'unknown'

export type TikTokAnalyzerInput = {
  id?: string | null
  channel_id?: string | null
  title: string
  hook?: string | null
  source_name?: string | null
  source_type?: string | null
  sport?: string | null
  league?: string | null
  duration_seconds?: number | null
  aspect_ratio?: string | null
  ai_score?: number | null
  virality_score?: number | null
  hook_strength?: number | null
  emotion?: string | null
  recommended_hook?: string | null
  risk_flags?: string[] | null
  moderation_notes?: string[] | null
}

export type TikTokAnalyzerOutput = {
  priorityScore: number
  rankLabel: TikTokRankLabel
  reasonTags: TikTokReasonTag[]
  whyNow: string
  operatorSummary: string
  confidence: TikTokConfidence
  captionDraft: string
  hashtagPack: string[]
  hookLine: string
  alternateCaptions?: string[]
  provider: 'heuristic' | 'gemini'
  analyzedAt: string
}

export type TikTokVerticalReadiness = {
  requiredWidth: 1080
  requiredHeight: 1920
  requiredRatio: '9:16'
  width: number | null
  height: number | null
  verticalStatus: VerticalStatus
  manualException: boolean
}

export const TIKTOK_ANALYZER_NOTE_PREFIX = 'tiktok_analyzer_v1:'
const RENDER_WIDTH_PREFIX = 'render_width:'
const RENDER_HEIGHT_PREFIX = 'render_height:'
const VERTICAL_EXCEPTION_PREFIX = 'vertical_manual_exception:'

const ALLOWED_REASON_TAGS: TikTokReasonTag[] = [
  'breaking',
  'rivalry',
  'star_player',
  'controversy',
  'fan_reaction',
  'highlight',
  'debut',
  'injury',
  'championship',
  'viral_audio_fit',
  'low_quality',
  'wrong_format',
]

const LANE_HASHTAGS: Record<string, string[]> = {
  sports: ['#Sports', '#GameTime', '#Highlights', '#RunnitBack'],
  arena: ['#Gaming', '#Esports', '#Twitch', '#RunnitBackGaming'],
  futbol: ['#Futbol', '#Soccer', '#Golazo', '#RunnitBack'],
  runnitbackcfb: ['#CollegeFootball', '#CFB', '#GameDay', '#RunnitBack'],
  women: ['#WomensSports', '#GameTime', '#Highlights', '#RunnitBack'],
  combat: ['#UFC', '#MMA', '#FightNight', '#RunnitBack'],
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)))
}

function compact(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

function truncate(value: string, max: number): string {
  const clean = compact(value)
  return clean.length <= max ? clean : `${clean.slice(0, max - 3).trim()}...`
}

function normalizedText(input: TikTokAnalyzerInput): string {
  return [
    input.title,
    input.hook,
    input.source_name,
    input.sport,
    input.league,
    input.emotion,
    ...(input.risk_flags ?? []),
    ...(input.moderation_notes ?? []),
  ].map((value) => compact(value).toLowerCase()).join(' ')
}

function laneKeyForInput(input: TikTokAnalyzerInput): string {
  const meta = input.channel_id ? getChannelMeta(input.channel_id) : null
  return meta?.slug ?? 'sports'
}

function laneLabel(input: TikTokAnalyzerInput): string {
  const meta = input.channel_id ? getChannelMeta(input.channel_id) : null
  return meta?.label ?? input.sport ?? 'RB Sports'
}

function reasonTagsForInput(input: TikTokAnalyzerInput): TikTokReasonTag[] {
  const text = normalizedText(input)
  const tags = new Set<TikTokReasonTag>()

  if (/\b(breaking|just in|trade|signed|fired|upset|stunner)\b/.test(text)) tags.add('breaking')
  if (/\b(rival|derby|clasico|beef|rematch|grudge|trash talk|hate)\b/.test(text)) tags.add('rivalry')
  if (/\b(lebron|caitlin|messi|ronaldo|mahomes|judge|ohtani|star|mvp|champion)\b/.test(text)) tags.add('star_player')
  if (/\b(controversy|controversial|ejected|suspended|fine|scandal|called out|heated)\b/.test(text)) tags.add('controversy')
  if (/\b(fans|crowd|reaction|reacts|stunned|goes crazy|erupts)\b/.test(text)) tags.add('fan_reaction')
  if (/\b(highlight|dunk|goal|golazo|touchdown|ko|knockout|clutch|insane|walkoff|comeback)\b/.test(text)) tags.add('highlight')
  if (/\b(debut|first game|rookie|first start|first look)\b/.test(text)) tags.add('debut')
  if (/\b(injury|injured|limps|hurt|questionable|out for)\b/.test(text)) tags.add('injury')
  if (/\b(championship|title|final|playoff|world cup|cup final|trophy)\b/.test(text)) tags.add('championship')
  if (/\b(trend|sound|audio|viral|meme|edit)\b/.test(text)) tags.add('viral_audio_fit')
  if (/\b(low quality|blurry|watermark|bad audio|unclear)\b/.test(text)) tags.add('low_quality')

  const vertical = getTikTokVerticalReadiness(input)
  if (vertical.verticalStatus === 'blocked_wrong_format') tags.add('wrong_format')

  if (tags.size === 0) tags.add('highlight')
  return [...tags].filter((tag) => ALLOWED_REASON_TAGS.includes(tag)).slice(0, 4)
}

function rankForScore(score: number, tags: TikTokReasonTag[]): TikTokRankLabel {
  if (tags.includes('wrong_format') || tags.includes('low_quality')) return score >= 78 ? 'Hold' : 'Reject'
  if (score >= 84) return 'Hot'
  if (score >= 64) return 'Solid'
  if (score >= 42) return 'Hold'
  return 'Reject'
}

function confidenceForInput(input: TikTokAnalyzerInput, score: number): TikTokConfidence {
  const signals = [
    input.title,
    input.hook,
    input.source_name,
    input.duration_seconds,
    input.ai_score,
    input.virality_score,
    input.hook_strength,
  ].filter((value) => value !== null && value !== undefined && `${value}`.trim() !== '').length

  if (signals >= 6 && score >= 70) return 'high'
  if (signals >= 4) return 'medium'
  return 'low'
}

function tagFromValue(value: string | null | undefined): string | null {
  const clean = compact(value).replace(/[^a-z0-9]/gi, '')
  return clean ? `#${clean}` : null
}

function uniqueTags(tags: Array<string | null>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const tag of tags) {
    if (!tag) continue
    const normalized = tag.toLowerCase()
    if (seen.has(normalized)) continue
    seen.add(normalized)
    result.push(tag.startsWith('#') ? tag : `#${tag}`)
    if (result.length === 6) break
  }
  return result
}

function buildHookLine(input: TikTokAnalyzerInput, tags: TikTokReasonTag[]): string {
  const base = compact(input.recommended_hook) || compact(input.hook) || compact(input.title) || 'This clip has the timeline moving'
  if (tags.includes('controversy')) return truncate(`Everybody is going to have a take on this: ${base}`, 96)
  if (tags.includes('rivalry')) return truncate(`Rivalry energy just hit a new level: ${base}`, 96)
  if (tags.includes('championship')) return truncate(`This is title-stage pressure: ${base}`, 96)
  if (tags.includes('highlight')) return truncate(base, 96)
  return truncate(base, 96)
}

function captionForLane(input: TikTokAnalyzerInput, hookLine: string): string {
  const lane = laneKeyForInput(input)
  const league = compact(input.league || input.sport)

  if (lane === 'arena') return truncate(`${hookLine} ${league ? `${league} ` : ''}is moving fast.`, 112)
  if (lane === 'futbol') return truncate(`${hookLine} ${league ? `${league} ` : ''}energy all over this.`, 112)
  if (lane === 'runnitbackcfb') return truncate(`${hookLine} This is why Saturdays get loud.`, 112)
  if (lane === 'women') return truncate(`${hookLine} Big-time moment.`, 112)
  if (lane === 'combat') return truncate(`${hookLine} Fight-night pressure.`, 112)
  return truncate(`${hookLine} The timeline is not letting this one breathe.`, 112)
}

function hashtagPackForInput(input: TikTokAnalyzerInput, tags: TikTokReasonTag[]): string[] {
  const lane = laneKeyForInput(input)
  const laneTags = LANE_HASHTAGS[lane] ?? LANE_HASHTAGS.sports
  const reasonTags = tags.includes('rivalry')
    ? ['#Rivalry']
    : tags.includes('championship')
      ? ['#Championship']
      : tags.includes('highlight')
        ? ['#Highlights']
        : []

  return uniqueTags([
    tagFromValue(input.league),
    tagFromValue(input.sport),
    ...reasonTags,
    ...laneTags,
  ])
}

function buildWhyNow(input: TikTokAnalyzerInput, tags: TikTokReasonTag[]): string {
  if (tags.includes('breaking')) return 'Fresh enough to lead the lane before the timeline gets crowded.'
  if (tags.includes('controversy')) return 'Debate value is high right now, so the first clean caption matters.'
  if (tags.includes('rivalry')) return 'Rivalry clips travel while fans are still choosing sides.'
  if (tags.includes('championship')) return 'Big-stage stakes give this clip a clear reason to move now.'
  if (tags.includes('fan_reaction')) return 'The reaction is the story, and that usually decays quickly.'
  if (laneKeyForInput(input) === 'arena') return 'Gaming and esports clips need speed while the lobby is still talking.'
  return 'It has enough current momentum to review before lower-signal clips.'
}

function buildOperatorSummary(input: TikTokAnalyzerInput, score: number, tags: TikTokReasonTag[]): string {
  const lane = laneLabel(input)
  const source = compact(input.source_name) || 'source'
  const tag = tags[0]?.replace(/_/g, ' ') ?? 'clip'
  return `${lane}: ${source} clip ranks ${score}/100 on ${tag} signal.`
}

function basePriority(input: TikTokAnalyzerInput): number {
  const ai = typeof input.ai_score === 'number' ? input.ai_score : null
  const virality = typeof input.virality_score === 'number' ? input.virality_score : null
  const hook = typeof input.hook_strength === 'number' ? input.hook_strength : null
  const duration = typeof input.duration_seconds === 'number' ? input.duration_seconds : null

  let score = ai ?? 58
  if (virality !== null) score = score * 0.55 + virality * 0.45
  if (hook !== null) score = score * 0.72 + hook * 0.28
  if (duration !== null && duration > 0 && duration <= 20) score += 4
  if (duration !== null && duration > 45) score -= 6

  return score
}

function heuristicAnalyze(input: TikTokAnalyzerInput): TikTokAnalyzerOutput {
  const tags = reasonTagsForInput(input)
  let score = basePriority(input)
  if (tags.includes('breaking')) score += 8
  if (tags.includes('controversy') || tags.includes('rivalry')) score += 6
  if (tags.includes('star_player') || tags.includes('championship')) score += 5
  if (tags.includes('fan_reaction') || tags.includes('highlight')) score += 3
  if (tags.includes('low_quality')) score -= 18
  if (tags.includes('wrong_format')) score -= 22

  const priorityScore = clampScore(score)
  const rankLabel = rankForScore(priorityScore, tags)
  const hookLine = buildHookLine(input, tags)
  const hashtagPack = hashtagPackForInput(input, tags)
  const captionDraft = captionForLane(input, hookLine)

  return {
    priorityScore,
    rankLabel,
    reasonTags: tags,
    whyNow: buildWhyNow(input, tags),
    operatorSummary: buildOperatorSummary(input, priorityScore, tags),
    confidence: confidenceForInput(input, priorityScore),
    captionDraft,
    hashtagPack,
    hookLine,
    alternateCaptions: [
      truncate(`${hookLine} Who saw this coming?`, 112),
      truncate(`${hookLine} This one is going to split the comments.`, 112),
    ],
    provider: 'heuristic',
    analyzedAt: new Date().toISOString(),
  }
}

function parseOutput(value: unknown, fallback: TikTokAnalyzerOutput): TikTokAnalyzerOutput {
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<TikTokAnalyzerOutput>
    : {}
  const reasonTags = Array.isArray(candidate.reasonTags)
    ? candidate.reasonTags.filter((tag): tag is TikTokReasonTag => ALLOWED_REASON_TAGS.includes(tag as TikTokReasonTag))
    : fallback.reasonTags
  const rankLabel = ['Hot', 'Solid', 'Hold', 'Reject'].includes(String(candidate.rankLabel))
    ? candidate.rankLabel as TikTokRankLabel
    : rankForScore(clampScore(Number(candidate.priorityScore ?? fallback.priorityScore)), reasonTags)
  const hashtagPack = Array.isArray(candidate.hashtagPack)
    ? candidate.hashtagPack.filter((tag): tag is string => typeof tag === 'string' && tag.trim().startsWith('#')).slice(0, 6)
    : fallback.hashtagPack

  return {
    priorityScore: clampScore(Number(candidate.priorityScore ?? fallback.priorityScore)),
    rankLabel,
    reasonTags: reasonTags.length > 0 ? reasonTags : fallback.reasonTags,
    whyNow: truncate(compact(candidate.whyNow) || fallback.whyNow, 180),
    operatorSummary: truncate(compact(candidate.operatorSummary) || fallback.operatorSummary, 180),
    confidence: ['low', 'medium', 'high'].includes(String(candidate.confidence)) ? candidate.confidence as TikTokConfidence : fallback.confidence,
    captionDraft: truncate(compact(candidate.captionDraft) || fallback.captionDraft, 140),
    hashtagPack: hashtagPack.length > 0 ? hashtagPack : fallback.hashtagPack,
    hookLine: truncate(compact(candidate.hookLine) || fallback.hookLine, 110),
    alternateCaptions: Array.isArray(candidate.alternateCaptions)
      ? candidate.alternateCaptions.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 3)
      : fallback.alternateCaptions,
    provider: candidate.provider === 'gemini' ? 'gemini' : fallback.provider,
    analyzedAt: compact(candidate.analyzedAt) || new Date().toISOString(),
  }
}

async function analyzeWithGemini(input: TikTokAnalyzerInput, fallback: TikTokAnalyzerOutput): Promise<TikTokAnalyzerOutput> {
  if (process.env.RBHQ_ANALYZER_PROVIDER !== 'gemini' || !process.env.GEMINI_API_KEY?.trim()) {
    return fallback
  }

  try {
    const text = await generateGeminiJson({
      timeoutMs: 8_000,
      responseJsonSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          priorityScore: { type: 'number', minimum: 0, maximum: 100 },
          rankLabel: { type: 'string', enum: ['Hot', 'Solid', 'Hold', 'Reject'] },
          reasonTags: { type: 'array', items: { type: 'string', enum: ALLOWED_REASON_TAGS } },
          whyNow: { type: 'string' },
          operatorSummary: { type: 'string' },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          captionDraft: { type: 'string' },
          hashtagPack: { type: 'array', items: { type: 'string' } },
          hookLine: { type: 'string' },
          alternateCaptions: { type: 'array', items: { type: 'string' } },
        },
        required: ['priorityScore', 'rankLabel', 'reasonTags', 'whyNow', 'operatorSummary', 'confidence', 'captionDraft', 'hashtagPack', 'hookLine'],
      },
      prompt: [
        'Analyze this RBHQ clip for TikTok only.',
        'Return strict JSON only. Do not approve, reject, publish, or make unsupported claims.',
        'Use only these reasonTags: ' + ALLOWED_REASON_TAGS.join(', '),
        'Caption must be short, punchy, lane-aware, TikTok-first, and not corporate.',
        JSON.stringify({ input, deterministicFallback: fallback }),
      ].join('\n\n'),
    })
    return parseOutput({ ...JSON.parse(text), provider: 'gemini' }, fallback)
  } catch {
    return fallback
  }
}

export async function analyzeClipForTikTok(input: TikTokAnalyzerInput): Promise<TikTokAnalyzerOutput> {
  const fallback = heuristicAnalyze(input)
  return analyzeWithGemini(input, fallback)
}

export function getStoredTikTokAnalysis(notes: string[] | null | undefined): TikTokAnalyzerOutput | null {
  const note = notes?.find((item) => item.startsWith(TIKTOK_ANALYZER_NOTE_PREFIX))
  if (!note) return null
  try {
    const parsed = JSON.parse(note.slice(TIKTOK_ANALYZER_NOTE_PREFIX.length)) as unknown
    return parseOutput(parsed, heuristicAnalyze({ title: 'Untitled clip', moderation_notes: notes ?? [] }))
  } catch {
    return null
  }
}

export function withStoredTikTokAnalysis(notes: string[], analysis: TikTokAnalyzerOutput): string[] {
  return [
    ...notes.filter((note) => !note.startsWith(TIKTOK_ANALYZER_NOTE_PREFIX)),
    `${TIKTOK_ANALYZER_NOTE_PREFIX}${JSON.stringify(analysis)}`,
  ]
}

function readNoteNumber(notes: string[] | null | undefined, prefix: string): number | null {
  const note = notes?.find((item) => item.startsWith(prefix))
  const parsed = Number(note?.slice(prefix.length))
  return Number.isFinite(parsed) ? parsed : null
}

export function getTikTokVerticalReadiness(input: {
  aspect_ratio?: string | null
  moderation_notes?: string[] | null
}): TikTokVerticalReadiness {
  const width = readNoteNumber(input.moderation_notes, RENDER_WIDTH_PREFIX)
  const height = readNoteNumber(input.moderation_notes, RENDER_HEIGHT_PREFIX)
  const manualException = input.moderation_notes?.some((note) =>
    note.toLowerCase() === `${VERTICAL_EXCEPTION_PREFIX}true`,
  ) ?? false

  let verticalStatus: VerticalStatus = 'unknown'
  if (width !== null && height !== null) {
    if (width === 1080 && height === 1920) {
      verticalStatus = 'vertical_ready'
    } else {
      const ratio = width > 0 && height > 0 ? width / height : 0
      verticalStatus = Math.abs(ratio - 9 / 16) < 0.02 ? 'needs_resize' : 'blocked_wrong_format'
    }
  }

  return {
    requiredWidth: 1080,
    requiredHeight: 1920,
    requiredRatio: '9:16',
    width,
    height,
    verticalStatus,
    manualException,
  }
}

export function hasTikTokPostingReadiness(input: {
  moderation_notes: string[]
  aspect_ratio?: string | null
}): boolean {
  const vertical = getTikTokVerticalReadiness(input)
  return vertical.verticalStatus === 'vertical_ready' || vertical.manualException
}
