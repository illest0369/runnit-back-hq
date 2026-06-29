import { generateGeminiJson } from './client'
import {
  GeminiBatchScoreSchema,
  GeminiClipScoreSchema,
  type GeminiClipScore,
} from './schema'

export type GeminiScoreClipInput = {
  external_id?: string | null
  title: string
  hook?: string | null
  creator?: string | null
  source_name?: string | null
  source_url?: string | null
  original_platform?: string | null
  sourcePlatform?: string | null
  transcript?: string | null
  metadata?: Record<string, unknown> | null
  duration_seconds?: number | null
  ai_score?: number | null
  sport?: string | null
  league?: string | null
}

export type GeminiScoredClip<T extends GeminiScoreClipInput = GeminiScoreClipInput> = T & {
  virality_score: number
  hook_strength: number
  emotion: string
  sports_category: string
  league: string | null
  recommended_hook: string
  risk_flags: string[]
  moderation_notes: string[]
  gemini_processed_at: string
  ai_score: number
}

export type GeminiBatchScoringResult<T extends GeminiScoreClipInput = GeminiScoreClipInput> = {
  scored: Array<GeminiScoredClip<T>>
  failed: Array<{ external_id: string | null; error: string }>
}

const GEMINI_SCORE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    virality_score: { type: 'number', minimum: 0, maximum: 100 },
    hook_strength: { type: 'number', minimum: 0, maximum: 100 },
    emotion: { type: 'string' },
    sports_category: { type: 'string' },
    league: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    recommended_hook: { type: 'string' },
    risk_flags: { type: 'array', items: { type: 'string' } },
    moderation_notes: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'virality_score',
    'hook_strength',
    'emotion',
    'sports_category',
    'league',
    'recommended_hook',
    'risk_flags',
    'moderation_notes',
  ],
}

const GEMINI_BATCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    clips: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          external_id: { type: 'string' },
          score: GEMINI_SCORE_SCHEMA,
        },
        required: ['external_id', 'score'],
      },
    },
  },
  required: ['clips'],
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('GEMINI_MALFORMED_JSON')
  }
}

function applyScore<T extends GeminiScoreClipInput>(clip: T, score: GeminiClipScore): GeminiScoredClip<T> {
  const aiScore = Math.round((score.virality_score * 0.65 + score.hook_strength * 0.35) * 100) / 100

  return {
    ...clip,
    virality_score: score.virality_score,
    hook_strength: score.hook_strength,
    emotion: score.emotion,
    sports_category: score.sports_category,
    league: score.league || clip.league || null,
    recommended_hook: score.recommended_hook,
    risk_flags: score.risk_flags,
    moderation_notes: score.moderation_notes,
    gemini_processed_at: new Date().toISOString(),
    ai_score: aiScore,
  }
}

export async function scoreClipWithGemini(input: GeminiScoreClipInput): Promise<GeminiClipScore> {
  const prompt = [
    'You score sports-media clips for RBHQ moderation.',
    'Return strict JSON only. No markdown. No prose.',
    'You assist human operators only. Do not approve, reject, or recommend posting decisions.',
    'Score hook strength and virality from 0 to 100. Provide concise moderation notes and risk flags.',
    JSON.stringify(input),
  ].join('\n\n')

  const text = await generateGeminiJson({
    prompt,
    responseJsonSchema: GEMINI_SCORE_SCHEMA,
  })

  return GeminiClipScoreSchema.parse(parseJson(text))
}

export async function scoreClipsWithGemini<T extends GeminiScoreClipInput>(
  clips: T[],
): Promise<GeminiBatchScoringResult<T>> {
  if (clips.length === 0) {
    return { scored: [], failed: [] }
  }

  try {
    const prompt = [
      'You score sports-media clips for RBHQ moderation.',
      'Return strict JSON only with a top-level clips array. No markdown. No prose.',
      'You assist human operators only. Do not approve, reject, or recommend posting decisions.',
      'For each item, return its external_id and score object.',
      JSON.stringify(
        clips.map((clip, index) => ({
          external_id: clip.external_id || `clip-${index}`,
          title: clip.title,
          hook: clip.hook,
          source_name: clip.source_name,
          source_url: clip.source_url,
          original_platform: clip.original_platform,
          duration_seconds: clip.duration_seconds,
          normalized_score: clip.ai_score,
          sport: clip.sport,
          league: clip.league,
        })),
      ),
    ].join('\n\n')

    const text = await generateGeminiJson({
      prompt,
      responseJsonSchema: GEMINI_BATCH_SCHEMA,
    })
    const parsed = GeminiBatchScoreSchema.parse(parseJson(text))
    const scoresById = new Map(parsed.clips.map((item) => [item.external_id, item.score]))

    const scored: Array<GeminiScoredClip<T>> = []
    const failed: GeminiBatchScoringResult<T>['failed'] = []

    clips.forEach((clip, index) => {
      const key = clip.external_id || `clip-${index}`
      const score = scoresById.get(key)
      if (score) {
        scored.push(applyScore(clip, score))
      } else {
        failed.push({ external_id: clip.external_id ?? null, error: 'GEMINI_SCORE_MISSING' })
      }
    })

    return { scored, failed }
  } catch (error) {
    return {
      scored: [],
      failed: clips.map((clip) => ({
        external_id: clip.external_id ?? null,
        error: error instanceof Error ? error.message : 'GEMINI_SCORE_FAILED',
      })),
    }
  }
}
