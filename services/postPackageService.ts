import type { ChannelMetaRecord } from '../lib/channel-meta'
import type { PostRecommendation } from '../lib/runnitback'
import type { ClipCandidate } from './segmentService'

export type GeneratedPostPackage = {
  title: string
  hook: string
  caption: string
  hashtags: string[]
  score: number
  riskNotes: string[]
  recommendation: PostRecommendation
}

const CHANNEL_HASHTAGS: Record<string, string[]> = {
  sports: ['sports', 'runnitback'],
  arena: ['gaming', 'esports', 'runnitback'],
  combat: ['ufc', 'boxing', 'mma', 'runnitback'],
  women: ['womenssports', 'wnba', 'runnitback'],
  college_football: ['collegefootball', 'cfb', 'runnitbackcfb', 'runnitback'],
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function stripTerminalPunctuation(value: string) {
  return compactWhitespace(value).replace(/[.!?]+$/, '').trim()
}

function truncate(value: string, maxLength: number) {
  const cleaned = compactWhitespace(value)
  if (cleaned.length <= maxLength) {
    return cleaned
  }

  return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trim()}...`
}

function sentenceCase(value: string) {
  const cleaned = compactWhitespace(value)
  if (!cleaned) {
    return cleaned
  }

  return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`
}

const VAGUE_HOOK_PATTERNS = [
  /^this changes everything\.?$/i,
  /^this is crazy\.?$/i,
  /^nobody is ready for this\.?$/i,
  /^watch this\.?$/i,
  /^you need to see this\.?$/i,
]

const ACTION_WORDS = [
  'hits',
  'scores',
  'wins',
  'loses',
  'throws',
  'catches',
  'blocks',
  'knocks',
  'finishes',
  'beats',
  'misses',
]

function splitSentences(value: string) {
  return compactWhitespace(value)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

function isVagueHook(value: string) {
  const cleaned = stripTerminalPunctuation(value)
  return !cleaned || VAGUE_HOOK_PATTERNS.some((pattern) => pattern.test(cleaned))
}

function clarityScore(sentence: string) {
  const normalized = sentence.toLowerCase()
  const wordCount = compactWhitespace(sentence).split(/\s+/).filter(Boolean).length
  let score = 0

  if (/\d/.test(sentence)) score += 4
  if (/\b[A-Z][a-zA-Z]{2,}\b/.test(sentence)) score += 3
  if (ACTION_WORDS.some((word) => normalized.includes(word))) score += 3
  if (/\b(game|fight|match|quarter|second|winner|touchdown|goal|knockout)\b/.test(normalized)) score += 2
  if (wordCount >= 5 && wordCount <= 13) score += 2
  if (isVagueHook(sentence)) score -= 8

  return score
}

function buildObviousHook(clip: ClipCandidate) {
  const candidates = [clip.primaryHook, ...splitSentences(clip.text)]
    .map((sentence) => stripTerminalPunctuation(sentence))
    .filter(Boolean)

  const best = candidates
    .map((sentence) => ({ sentence, score: clarityScore(sentence) }))
    .sort((left, right) => right.score - left.score)[0]?.sentence

  return truncate(sentenceCase(best || clip.primaryHook), 86)
}

function extractHashtagCandidates(text: string) {
  const matches = text.match(/\b[A-Z][a-zA-Z]{2,}\b/g) ?? []
  return matches
    .map((match) => match.toLowerCase())
    .filter((match) => !['the', 'this', 'that', 'what', 'they'].includes(match))
    .slice(0, 3)
}

function buildRiskNotes(clip: ClipCandidate) {
  const notes: string[] = []
  const normalized = clip.text.toLowerCase()

  if (clip.score < 55) {
    notes.push('Low viral score; likely needs a stronger source moment.')
  }

  if (clip.viralReasoning.some((reason) => reason.toLowerCase().includes('opening is slower'))) {
    notes.push('First two seconds may not stop scroll without strong visual context.')
  }

  if (!/\b[A-Z][a-zA-Z]{2,}\b/.test(clip.text) && !/(team|coach|game|player|fight|match)/i.test(clip.text)) {
    notes.push('Recognizable person, team, or event anchor is weak.')
  }

  if (/(rumor|alleged|lawsuit|injury|arrest|death|killed|slur)/i.test(normalized)) {
    notes.push('Sensitive claim detected; verify context before approval.')
  }

  if (notes.length === 0) {
    notes.push('No major risk notes detected by the agent.')
  }

  return notes
}

function recommendationForScore(score: number, riskNotes: string[]): PostRecommendation {
  const hasSensitiveRisk = riskNotes.some((note) => note.toLowerCase().includes('sensitive'))

  if (hasSensitiveRisk || score < 45) {
    return 'reject'
  }

  if (score < 70 || riskNotes.some((note) => !note.startsWith('No major'))) {
    return 'revise'
  }

  return 'approve'
}

export function buildGeneratedPostPackage(input: {
  clip: ClipCandidate
  channel: ChannelMetaRecord | null
  sourceTitle?: string | null
}): GeneratedPostPackage {
  const channel = input.channel
  const channelName = channel?.name ?? 'Runnit Back'
  const channelNiche = channel?.niche ?? 'sports'
  const hook = buildObviousHook(input.clip)
  const hookLead = stripTerminalPunctuation(hook)
  const titleSource = input.sourceTitle?.trim() || hookLead || 'Generated clip'
  const title = truncate(`${channelName}: ${titleSource}`, 72)
  const caption = truncate(`${hookLead}. ${channelName} has the angle.`, 180)
  const hashtagCandidates = extractHashtagCandidates(`${input.sourceTitle ?? ''} ${input.clip.text}`)
  const hashtags = Array.from(
    new Set([...(CHANNEL_HASHTAGS[channelNiche] ?? ['runnitback']), ...hashtagCandidates]),
  ).slice(0, 8)
  const riskNotes = buildRiskNotes(input.clip)
  const recommendation = recommendationForScore(input.clip.score, riskNotes)

  return {
    title,
    hook,
    caption,
    hashtags,
    score: input.clip.score,
    riskNotes,
    recommendation,
  }
}
