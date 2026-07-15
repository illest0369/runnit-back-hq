export type ScoutTranscriptRow = {
  id?: string | null
  transcript_source: string
  transcript_text: string | null
  transcript_json: unknown
  language: string | null
}

export type ScoutVideoRow = {
  id: string
  title: string
  description: string | null
  video_url: string
  thumbnail_url: string | null
  published_at: string | null
  source_channel_id: string | null
}

export type ScoutSegment = {
  start: number
  duration: number
  end: number
  text: string
}

export type ScoutCandidateInsert = {
  ingested_video_id: string
  target_channel_id: string | null
  start_seconds: number | null
  end_seconds: number | null
  title: string
  summary: string | null
  hook_text: string | null
  caption: string | null
  hashtags: string[]
  score: number
  score_breakdown: Record<string, unknown>
  status: 'candidate'
  updated_at: string
}

type MomentType =
  | 'emotion'
  | 'humor'
  | 'conflict'
  | 'surprise'
  | 'achievement'
  | 'fan_reaction'
  | 'analysis_quote'
  | 'sports_payoff'

type ContextBurden = 'low' | 'medium' | 'high'

export const TIKTOK_MOMENT_RECOMMENDATION_MODEL = 'rbhq-tiktok-moment-recommendation-v2'

const MIN_RECOMMENDATION_SCORE = 64
const MAX_RECOMMENDATIONS = 3

const EMOTION_TERMS = ['stunned', 'wild', 'chaos', 'pressure', 'clutch', 'comeback', 'heated', 'unbelievable', 'shocked', 'huge', 'tears', 'emotional', 'goosebumps']
const HUMOR_TERMS = ['funny', 'laugh', 'laughing', 'joke', 'hilarious', 'goofy', 'roast', 'troll']
const CONFLICT_TERMS = ['rivalry', 'versus', 'vs', 'heated', 'beef', 'argue', 'called out', 'chippy', 'controversy', 'controversial']
const ACHIEVEMENT_TERMS = ['first', 'record', 'history', 'champion', 'wins', 'won', 'ring', 'honor', 'mvp', 'goal', 'assist']
const FAN_REACTION_TERMS = ['fans', 'crowd', 'timeline', 'comment', 'reaction', 'reacting', 'debate', 'everyone']
const SURPRISE_TERMS = ['answers', 'turnaround', 'upset', 'unexpected', 'no way', 'suddenly', 'steal', 'buzzer', 'walk-off', 'shocked']
const QUOTE_TERMS = ['said', 'called', 'told', 'asked', 'responded', 'why', 'because', 'i ', 'we ', 'you ']
const SPORTS_TERMS = ['game', 'rookie', 'quarter', 'final', 'coach', 'team', 'fans', 'crowd', 'score', 'play', 'finish', 'highlight', 'goal', 'assist', 'jersey']

function compact(value: string | null | undefined, maxLength: number): string {
  const clean = value?.replace(/\s+/g, ' ').trim() ?? ''
  if (clean.length <= maxLength) return clean
  return `${clean.slice(0, maxLength - 3).trim()}...`
}

function countHits(text: string, terms: string[]): number {
  const lower = text.toLowerCase()
  return terms.filter((term) => lower.includes(term)).length
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function roundSeconds(value: number): number {
  return Number(value.toFixed(3))
}

function hashtagsFromText(text: string): string[] {
  const normalized = text.toLowerCase()
  const tags = ['RBHQ', 'WomensSports']
  if (normalized.includes('rookie')) tags.push('RookieWatch')
  if (normalized.includes('comeback') || normalized.includes('clutch')) tags.push('Clutch')
  if (normalized.includes('basketball') || normalized.includes('quarter')) tags.push('Basketball')
  if (normalized.includes('football')) tags.push('Football')
  if (normalized.includes('soccer') || normalized.includes('goal') || normalized.includes('nwsl')) tags.push('NWSL')
  tags.push('Highlights')
  return [...new Set(tags)].slice(0, 5)
}

export function readTimedSegments(transcriptJson: unknown): ScoutSegment[] {
  const rawSegments = Array.isArray(transcriptJson)
    ? transcriptJson
    : transcriptJson && typeof transcriptJson === 'object' && Array.isArray((transcriptJson as { segments?: unknown }).segments)
      ? (transcriptJson as { segments: unknown[] }).segments
      : []

  return rawSegments.flatMap((segment) => {
    if (!segment || typeof segment !== 'object') return []
    const record = segment as Record<string, unknown>
    const start = Number(record.start ?? record.start_seconds)
    const duration = Number(record.duration)
    const rawEnd = Number(record.end ?? record.end_seconds)
    const end = Number.isFinite(rawEnd) ? rawEnd : start + duration
    const text = typeof record.text === 'string' ? record.text.trim() : ''
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) return []
    return [{
      start,
      duration: roundSeconds(end - start),
      end,
      text,
    }]
  }).sort((a, b) => a.start - b.start)
}

function contextBurdenFor(text: string, hook: string, standaloneContext: boolean): ContextBurden {
  const pronounHeavy = /\b(she|they|it|that|this|her|them)\b/i.test(hook) && !/\b[A-Z][a-z]{2,}\b/.test(hook)
  if (standaloneContext && !pronounHeavy && hook.length >= 18) return 'low'
  if (text.length >= 120 && !pronounHeavy) return 'medium'
  return 'high'
}

function momentTypeFor(text: string): MomentType {
  const hits = [
    { type: 'humor' as const, count: countHits(text, HUMOR_TERMS) },
    { type: 'conflict' as const, count: countHits(text, CONFLICT_TERMS) },
    { type: 'surprise' as const, count: countHits(text, SURPRISE_TERMS) },
    { type: 'achievement' as const, count: countHits(text, ACHIEVEMENT_TERMS) },
    { type: 'fan_reaction' as const, count: countHits(text, FAN_REACTION_TERMS) },
    { type: 'emotion' as const, count: countHits(text, EMOTION_TERMS) },
    { type: 'analysis_quote' as const, count: countHits(text, QUOTE_TERMS) },
    { type: 'sports_payoff' as const, count: countHits(text, SPORTS_TERMS) },
  ].sort((left, right) => right.count - left.count)
  return hits[0]?.count ? hits[0].type : 'analysis_quote'
}

function shortReason(input: {
  momentType: MomentType
  contextBurden: ContextBurden
  firstSecondStrong: boolean
  score: number
}): string {
  const context = input.contextBurden === 'low' ? 'low context burden' : `${input.contextBurden} context burden`
  const hook = input.firstSecondStrong ? 'strong opening beat' : 'usable opening beat'
  return `${input.momentType.replace(/_/g, ' ')} moment with ${hook} and ${context}; scored ${input.score}.`
}

function scoreWindow(input: { text: string; hook: string; duration: number }) {
  const emotion = countHits(input.text, EMOTION_TERMS)
  const humor = countHits(input.text, HUMOR_TERMS)
  const conflict = countHits(input.text, CONFLICT_TERMS)
  const achievement = countHits(input.text, ACHIEVEMENT_TERMS)
  const fanReaction = countHits(input.text, FAN_REACTION_TERMS)
  const surprise = countHits(input.text, SURPRISE_TERMS)
  const quote = countHits(input.text, QUOTE_TERMS)
  const sports = countHits(input.text, SPORTS_TERMS)
  const hookHasPunch = /[?!]/.test(input.hook) || countHits(input.hook, [...EMOTION_TERMS, ...SURPRISE_TERMS, ...HUMOR_TERMS, ...CONFLICT_TERMS]) > 0
  const standaloneContext = input.text.length >= 180 && /\b[A-Z][a-z]+/.test(input.text)
  const captionability = input.text.length >= 120 && input.text.length <= 720
  const firstSecondStrong = input.hook.length >= 18 && (hookHasPunch || countHits(input.hook, [...QUOTE_TERMS, ...SPORTS_TERMS]) > 0)
  const contextBurden = contextBurdenFor(input.text, input.hook, standaloneContext)
  const momentType = momentTypeFor(input.text)

  const score = clamp(
    48 +
      Math.min(14, emotion * 4) +
      Math.min(12, humor * 4) +
      Math.min(12, conflict * 4) +
      Math.min(10, achievement * 3) +
      Math.min(8, fanReaction * 3) +
      Math.min(12, surprise * 4) +
      Math.min(10, quote * 3) +
      Math.min(10, sports * 2) +
      (hookHasPunch ? 8 : 0) +
      (firstSecondStrong ? 6 : 0) +
      (standaloneContext ? 5 : 0) +
      (captionability ? 5 : 0) -
      (contextBurden === 'high' ? 8 : contextBurden === 'medium' ? 3 : 0) -
      (input.duration > 55 ? 3 : 0),
    45,
    92,
  )

  return {
    score,
    breakdown: {
      hookStrength: hookHasPunch ? 'strong' : 'moderate',
      firstSecondStrong,
      momentType,
      contextBurden,
      emotionHits: emotion,
      humorHits: humor,
      conflictHits: conflict,
      achievementHits: achievement,
      fanReactionHits: fanReaction,
      surpriseHits: surprise,
      quoteStrengthHits: quote,
      sportsShareabilityHits: sports,
      standaloneContext,
      tiktokCaptionability: captionability,
    },
  }
}

function buildWindows(segments: ScoutSegment[]) {
  const windows: Array<{ start: number; end: number; text: string; hook: string; duration: number }> = []

  for (let index = 0; index < segments.length; index += 1) {
    const start = segments[index].start
    const windowSegments: ScoutSegment[] = []

    for (let cursor = index; cursor < segments.length; cursor += 1) {
      const current = segments[cursor]
      const end = current.end
      const duration = end - start
      if (duration > 60) break

      windowSegments.push(current)
      if (duration >= 15) {
        const hook = windowSegments
          .filter((segment) => segment.start < start + 3.5)
          .map((segment) => segment.text)
          .join(' ')
        windows.push({
          start,
          end,
          duration,
          hook: hook || windowSegments[0].text,
          text: windowSegments.map((segment) => segment.text).join(' '),
        })
        break
      }
    }
  }

  return windows
}

function overlaps(left: { start: number; end: number }, right: { start: number; end: number }): boolean {
  return left.start < right.end && right.start < left.end
}

function selectTopNonOverlapping<T extends { window: { start: number; end: number }; scored: { score: number } }>(items: T[]): T[] {
  const selected: T[] = []
  for (const item of items) {
    if (item.scored.score < MIN_RECOMMENDATION_SCORE) continue
    if (selected.every((existing) => !overlaps(existing.window, item.window))) selected.push(item)
    if (selected.length === MAX_RECOMMENDATIONS) break
  }
  return selected
}

function recommendationSetId(videoId: string, transcript: ScoutTranscriptRow | null): string {
  return [
    'moment-recs',
    videoId,
    transcript?.id ?? transcript?.transcript_source ?? 'no-transcript',
    TIKTOK_MOMENT_RECOMMENDATION_MODEL,
  ].join(':')
}

function buildPlaceholderCandidate(
  video: ScoutVideoRow,
  transcript: ScoutTranscriptRow | null,
  targetChannelId: string | null,
  now: string,
): ScoutCandidateInsert {
  const segments = transcript ? readTimedSegments(transcript.transcript_json) : []
  const transcriptText = transcript?.transcript_text?.trim() || segments.map((segment) => segment.text).join(' ')
  const basis = transcriptText || `${video.title}. ${video.description ?? ''}`
  const summary = compact(basis, transcriptText ? 220 : 180)
  const hook = compact(video.title, 120)
  const score = transcriptText ? 52 : 38

  return {
    ingested_video_id: video.id,
    target_channel_id: targetChannelId,
    start_seconds: null,
    end_seconds: null,
    title: compact(video.title, 140) || 'Untitled candidate',
    summary,
    hook_text: hook,
    caption: compact(hook || video.title, 220),
    hashtags: hashtagsFromText(video.title),
    score,
    score_breakdown: {
      model: 'rbhq-tiktok-scout-v1-conservative',
      platform: 'tiktok',
      recommendationSetId: recommendationSetId(video.id, transcript),
      role: 'metadata_placeholder',
      transcriptAvailable: Boolean(transcript),
      timedTranscriptAvailable: false,
      operatorSelection: null,
      limitations: [
        'No timed transcript available; start_seconds and end_seconds are intentionally null.',
        'Candidate is based on title/description or untimed text only.',
      ],
      signals: {
        title: video.title,
        hasDescription: Boolean(video.description?.trim()),
        transcriptSource: transcript?.transcript_source ?? null,
      },
    },
    status: 'candidate',
    updated_at: now,
  }
}

export function buildTikTokClipCandidates(
  video: ScoutVideoRow,
  transcript: ScoutTranscriptRow | null,
  input: { targetChannelId?: string | null; now?: () => Date } = {},
): ScoutCandidateInsert[] {
  const targetChannelId = input.targetChannelId ?? null
  const now = (input.now ?? (() => new Date()))().toISOString()
  const segments = transcript ? readTimedSegments(transcript.transcript_json) : []
  if (segments.length === 0) {
    return [buildPlaceholderCandidate(video, transcript, targetChannelId, now)]
  }

  const windows = buildWindows(segments)
  if (windows.length === 0) {
    return [buildPlaceholderCandidate(video, transcript, targetChannelId, now)]
  }

  const ranked = windows
    .map((window) => ({ window, scored: scoreWindow(window) }))
    .sort((a, b) => b.scored.score - a.scored.score)
  const selected = selectTopNonOverlapping(ranked)
  if (selected.length === 0) return []

  const setId = recommendationSetId(video.id, transcript)
  return selected.map(({ window, scored }, index) => {
    const start = roundSeconds(window.start)
    const end = roundSeconds(window.end)
    const momentType = scored.breakdown.momentType as MomentType
    const contextBurden = scored.breakdown.contextBurden as ContextBurden
    const reason = shortReason({
      momentType,
      contextBurden,
      firstSecondStrong: Boolean(scored.breakdown.firstSecondStrong),
      score: scored.score,
    })

    return {
      ingested_video_id: video.id,
      target_channel_id: targetChannelId,
      start_seconds: start,
      end_seconds: end,
      title: compact(video.title, 140) || 'Untitled TikTok candidate',
      summary: compact(window.text, 260),
      hook_text: compact(window.hook, 140),
      caption: compact(window.hook || window.text, 220),
      hashtags: hashtagsFromText(`${video.title} ${window.text}`),
      score: scored.score,
      score_breakdown: {
        model: TIKTOK_MOMENT_RECOMMENDATION_MODEL,
        platform: 'tiktok',
        recommendationSetId: setId,
        role: index === 0 ? 'primary' : 'alternate',
        rank: index + 1,
        aiRecommendedStartSeconds: start,
        aiRecommendedEndSeconds: end,
        operatorSelection: null,
        momentType,
        contextBurden,
        shortReason: reason,
        transcriptExcerpt: compact(window.text, 420),
        transcriptAvailable: true,
        timedTranscriptAvailable: true,
        transcriptSource: transcript?.transcript_source ?? null,
        transcriptId: transcript?.id ?? null,
        targetLengthSeconds: '15-60',
        durationSeconds: roundSeconds(window.duration),
        reasons: scored.breakdown,
        limitations: ['Transcript-first recommendation only; operator selection and local render are required before TikTok staging.'],
      },
      status: 'candidate',
      updated_at: now,
    }
  })
}
