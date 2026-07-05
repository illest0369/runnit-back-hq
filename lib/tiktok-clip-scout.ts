export type ScoutTranscriptRow = {
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

type CandidateInsert = {
  ingested_video_id: string
  target_channel_id: null
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

const EMOTION_TERMS = ['stunned', 'wild', 'chaos', 'pressure', 'clutch', 'comeback', 'heated', 'unbelievable', 'shocked', 'huge']
const SURPRISE_TERMS = ['answers', 'turnaround', 'upset', 'unexpected', 'no way', 'suddenly', 'steal', 'buzzer', 'walk-off']
const QUOTE_TERMS = ['said', 'called', 'told', 'asked', 'responded', 'why', 'because', 'i ', 'we ', 'you ']
const SPORTS_TERMS = ['game', 'rookie', 'quarter', 'final', 'coach', 'team', 'fans', 'crowd', 'score', 'play', 'finish', 'highlight']

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

function hashtagsFromText(text: string): string[] {
  const normalized = text.toLowerCase()
  const tags = ['RBHQ', 'TikTokSports']
  if (normalized.includes('rookie')) tags.push('RookieWatch')
  if (normalized.includes('comeback') || normalized.includes('clutch')) tags.push('Clutch')
  if (normalized.includes('basketball') || normalized.includes('quarter')) tags.push('Basketball')
  if (normalized.includes('football')) tags.push('Football')
  tags.push('Sports')
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
      duration: Number((end - start).toFixed(3)),
      end,
      text,
    }]
  }).sort((a, b) => a.start - b.start)
}

function scoreWindow(input: { text: string; hook: string; duration: number }) {
  const emotion = countHits(input.text, EMOTION_TERMS)
  const surprise = countHits(input.text, SURPRISE_TERMS)
  const quote = countHits(input.text, QUOTE_TERMS)
  const sports = countHits(input.text, SPORTS_TERMS)
  const hookHasPunch = /[?!]/.test(input.hook) || countHits(input.hook, [...EMOTION_TERMS, ...SURPRISE_TERMS]) > 0
  const standaloneContext = input.text.length >= 180 && /\b[A-Z][a-z]+/.test(input.text) ? 1 : 0
  const captionability = input.text.length >= 120 && input.text.length <= 720 ? 1 : 0

  const score = clamp(
    48 +
      Math.min(14, emotion * 4) +
      Math.min(12, surprise * 4) +
      Math.min(10, quote * 3) +
      Math.min(10, sports * 2) +
      (hookHasPunch ? 8 : 0) +
      standaloneContext * 5 +
      captionability * 5 -
      (input.duration > 55 ? 3 : 0),
    45,
    92,
  )

  return {
    score,
    breakdown: {
      hookStrength: hookHasPunch ? 'strong' : 'moderate',
      emotionHits: emotion,
      surpriseHits: surprise,
      quoteStrengthHits: quote,
      sportsShareabilityHits: sports,
      standaloneContext: Boolean(standaloneContext),
      tiktokCaptionability: Boolean(captionability),
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

function buildPlaceholderCandidate(video: ScoutVideoRow, transcript: ScoutTranscriptRow | null): CandidateInsert {
  const segments = transcript ? readTimedSegments(transcript.transcript_json) : []
  const transcriptText = transcript?.transcript_text?.trim() || segments.map((segment) => segment.text).join(' ')
  const basis = transcriptText || `${video.title}. ${video.description ?? ''}`
  const summary = compact(basis, transcriptText ? 220 : 180)
  const hook = compact(video.title, 120)
  const score = transcriptText ? 52 : 38

  return {
    ingested_video_id: video.id,
    target_channel_id: null,
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
      transcriptAvailable: Boolean(transcript),
      timedTranscriptAvailable: false,
      limitations: ['No timed transcript available; start_seconds and end_seconds are intentionally null.', 'Candidate is based on title/description or untimed text only.'],
      signals: {
        title: video.title,
        hasDescription: Boolean(video.description?.trim()),
        transcriptSource: transcript?.transcript_source ?? null,
      },
    },
    status: 'candidate',
    updated_at: new Date().toISOString(),
  }
}

export function buildTikTokClipCandidates(video: ScoutVideoRow, transcript: ScoutTranscriptRow | null): CandidateInsert[] {
  const segments = transcript ? readTimedSegments(transcript.transcript_json) : []
  if (segments.length === 0) {
    return [buildPlaceholderCandidate(video, transcript)]
  }

  const windows = buildWindows(segments)
  if (windows.length === 0) {
    return [buildPlaceholderCandidate(video, transcript)]
  }

  return windows
    .map((window) => {
      const scored = scoreWindow(window)
      return {
        window,
        scored,
      }
    })
    .sort((a, b) => b.scored.score - a.scored.score)
    .slice(0, 3)
    .map(({ window, scored }) => ({
      ingested_video_id: video.id,
      target_channel_id: null,
      start_seconds: Number(window.start.toFixed(3)),
      end_seconds: Number(window.end.toFixed(3)),
      title: compact(video.title, 140) || 'Untitled TikTok candidate',
      summary: compact(window.text, 260),
      hook_text: compact(window.hook, 140),
      caption: compact(window.hook || window.text, 220),
      hashtags: hashtagsFromText(`${video.title} ${window.text}`),
      score: scored.score,
      score_breakdown: {
        model: 'rbhq-tiktok-scout-v1-timed-transcript',
        platform: 'tiktok',
        transcriptAvailable: true,
        timedTranscriptAvailable: true,
        transcriptSource: transcript?.transcript_source ?? null,
        targetLengthSeconds: '15-60',
        durationSeconds: Number(window.duration.toFixed(3)),
        reasons: scored.breakdown,
        limitations: ['Heuristic candidate only; manual approval and rendering are still required before n8n handoff.'],
      },
      status: 'candidate',
      updated_at: new Date().toISOString(),
    }))
}
