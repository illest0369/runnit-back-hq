import { z } from 'zod'

const score = z.number().finite().transform((value) => Math.min(100, Math.max(0, value)))

export const GeminiClipScoreSchema = z.object({
  virality_score: score,
  hook_strength: score,
  controversy_score: score.default(0),
  emotion: z.string().trim().min(1).max(80),
  sports_category: z.string().trim().min(1).max(80),
  league: z.string().trim().min(1).max(40).nullable().default(null),
  recommended_hook: z.string().trim().min(1).max(180),
  risk_flags: z.array(z.string().trim().min(1).max(80)).default([]),
  moderation_notes: z.array(z.string().trim().min(1).max(160)).default([]),
})

export type GeminiClipScore = z.infer<typeof GeminiClipScoreSchema>

export const GeminiBatchScoreSchema = z.object({
  clips: z.array(
    z.object({
      external_id: z.string().trim().min(1),
      score: GeminiClipScoreSchema,
    }),
  ),
})

export type GeminiBatchScore = z.infer<typeof GeminiBatchScoreSchema>
