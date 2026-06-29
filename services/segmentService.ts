import {
  buildReplyLearningContext,
  classifyReplyTypeFromText,
  type CommentType,
  type ReplyLearningContext,
} from '../lib/runnitback'

type TranscriptSegment = {
  start: number
  end: number
  text: string
}

type CandidateWindow = {
  start: number
  end: number
  duration: number
  text: string
  segments: TranscriptSegment[]
}

type CommentBait = {
  pinned: string
  replyStarter: string
}

export type ClipCandidate = {
  start: number
  end: number
  duration: number
  text: string
  viralReasoning: string[]
  primaryHook: string
  hookOptions: string[]
  commentBait: CommentBait | null
  replyType: CommentType
  baseScore: number
  score: number
}

const STRONG_OPINION_WORDS = ['wrong', 'crazy', 'never', 'always', 'terrible', 'awful']
const CONTRADICTION_WORDS = ['but', 'actually', 'however']
const EMOTIONAL_WORDS = ['insane', 'wild', 'unbelievable', 'crazy', 'shocking']
const FILLER_WORDS = ['um', 'uh', 'like', 'you know', 'kind of', 'sort of', 'basically']
const HOOK_STARTERS = ['here is', "here's", 'watch this', 'this is', 'the truth is', 'nobody talks about']
const SUBJECT_WORDS = ['he', 'she', 'they', 'team', 'player', 'coach', 'game', 'fight', 'match']

function countMatches(text: string, patterns: string[]) {
  return patterns.reduce((count, pattern) => count + (text.includes(pattern) ? 1 : 0), 0)
}

function countNamedEntities(text: string) {
  return (text.match(/\b[A-Z][a-zA-Z]{2,}\b/g) ?? []).length
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function hookLikePhrase(text: string) {
  const normalized = text.toLowerCase()
  return (
    HOOK_STARTERS.some((phrase) => normalized.includes(phrase)) ||
    normalized.includes('?') ||
    countMatches(normalized, STRONG_OPINION_WORDS) > 0 ||
    countMatches(normalized, EMOTIONAL_WORDS) > 0
  )
}

function hasSubject(text: string) {
  const normalized = text.toLowerCase()
  return countNamedEntities(text) > 0 || SUBJECT_WORDS.some((word) => normalized.includes(word))
}

function strongestSentence(text: string) {
  const sentences = splitSentences(text)
  if (sentences.length === 0) {
    return text.trim()
  }

  return sentences
    .map((sentence) => {
      const normalized = sentence.toLowerCase()
      const score =
        countMatches(normalized, STRONG_OPINION_WORDS) * 3 +
        countMatches(normalized, CONTRADICTION_WORDS) * 3 +
        countNamedEntities(sentence) * 2 +
        countMatches(normalized, EMOTIONAL_WORDS) * 2 +
        (countWords(sentence) < 12 ? 2 : 0) +
        (hookLikePhrase(sentence) ? 2 : 0)

      return { sentence, score }
    })
    .sort((left, right) => right.score - left.score)[0].sentence
}

function rewriteContrarian(sentence: string) {
  const cleaned = sentence.replace(/[.!?]+$/, '').trim()
  return `Most people are wrong about this: ${cleaned}.`
}

function rewriteCuriosity(sentence: string) {
  const cleaned = sentence.replace(/[.!?]+$/, '').trim()
  return `The part nobody is ready for is ${cleaned.toLowerCase()}.`
}

function buildCommentBait(primaryHook: string, replyType: CommentType): CommentBait {
  const hookLead = primaryHook.replace(/[.!?]+$/, '').trim()

  if (replyType === 'controversy' || replyType === 'hate') {
    return {
      pinned: 'This is a terrible take.',
      replyStarter: 'You agree or nah?',
    }
  }

  if (replyType === 'question') {
    return {
      pinned: `You really buying ${hookLead.toLowerCase()}?`,
      replyStarter: 'What would you say back?',
    }
  }

  return {
    pinned: `No way you watched ${hookLead.toLowerCase()} and stayed neutral.`,
    replyStarter: 'You with this or not?',
  }
}

function getSignalBreakdown(window: CandidateWindow) {
  const normalized = window.text.toLowerCase()
  const leadText = window.segments
    .filter((segment) => segment.start < window.start + 2)
    .map((segment) => segment.text)
    .join(' ')
    .trim()
  const bestSentence = strongestSentence(window.text)

  return {
    strongOpinion: countMatches(normalized, STRONG_OPINION_WORDS) > 0,
    contradiction: countMatches(normalized, CONTRADICTION_WORDS) > 0,
    namedEntity: countNamedEntities(window.text) > 0,
    shortSentence: countWords(bestSentence) < 12,
    emotional: countMatches(normalized, EMOTIONAL_WORDS) > 0,
    hookLead: Boolean(leadText && hookLikePhrase(leadText)),
    preferredDuration: window.duration >= 10 && window.duration <= 15,
    slowStart: !leadText || !hookLikePhrase(leadText),
    fillerHeavy: countMatches(normalized, FILLER_WORDS) >= 2,
    hasSubject: hasSubject(window.text),
  }
}

function baseWindowScore(window: CandidateWindow) {
  const signal = getSignalBreakdown(window)
  let score = 0

  if (signal.strongOpinion) score += 3
  if (signal.contradiction) score += 3
  if (signal.namedEntity) score += 2
  if (signal.shortSentence) score += 2
  if (signal.emotional) score += 2
  if (signal.hookLead) score += 2
  if (signal.preferredDuration) score += 2
  if (signal.slowStart) score -= 3
  if (signal.fillerHeavy) score -= 2
  if (!signal.hasSubject) score -= 2

  return Math.max(1, score)
}

function buildViralReasoning(window: CandidateWindow) {
  const signal = getSignalBreakdown(window)
  const reasons: string[] = []
  const payoffLine = strongestSentence(window.text).replace(/\s+/g, ' ').trim()

  if (signal.hookLead) {
    reasons.push('First two seconds contain a hook-like line.')
  } else {
    reasons.push('Opening is slower; subtitles and hook copy need to carry the first beat.')
  }

  if (signal.emotional) {
    reasons.push('Transcript contains an emotional spike.')
  }

  if (signal.contradiction || signal.strongOpinion) {
    reasons.push('Moment has conflict or a strong point of view.')
  }

  if (signal.namedEntity || signal.hasSubject) {
    reasons.push('Moment includes a recognizable person, team, coach, game, or event anchor.')
  }

  if (payoffLine) {
    reasons.push(`Payoff line: ${payoffLine}`)
  }

  if (signal.preferredDuration) {
    reasons.push('Timestamp range fits a short-form clip window.')
  }

  return reasons.slice(0, 6)
}

function toQualityScore(baseScore: number, multiplier: number) {
  return Math.max(0, Math.min(100, Math.round(baseScore * multiplier * 10)))
}

function createFallbackWindows(segments: TranscriptSegment[]): CandidateWindow[] {
  return segments
    .map((segment) => ({
      start: segment.start,
      end: Math.min(segment.end + 10, segment.start + 12),
      duration: Math.min(segment.end + 10, segment.start + 12) - segment.start,
      text: segment.text,
      segments: [segment],
    }))
    .filter((window) => window.duration >= 6 && window.duration <= 25)
}

function createWindows(segments: TranscriptSegment[]): CandidateWindow[] {
  const windows: CandidateWindow[] = []

  for (let startIndex = 0; startIndex < segments.length; startIndex += 1) {
    let text = ''
    const includedSegments: TranscriptSegment[] = []
    const start = segments[startIndex].start

    for (let endIndex = startIndex; endIndex < segments.length; endIndex += 1) {
      const segment = segments[endIndex]
      includedSegments.push(segment)
      text = `${text} ${segment.text}`.trim()
      const end = segment.end
      const duration = end - start

      if (duration >= 6 && duration <= 25) {
        windows.push({ start, end, duration, text, segments: [...includedSegments] })
      }

      if (duration > 25) {
        break
      }
    }
  }

  return windows.length > 0 ? windows : createFallbackWindows(segments)
}

function overlaps(left: ClipCandidate, right: ClipCandidate) {
  return left.start < right.end && right.start < left.end
}

export function scoreSegments(
  segments: TranscriptSegment[],
  clipCount = 5,
  learningContext: ReplyLearningContext = buildReplyLearningContext({}),
): ClipCandidate[] {
  const candidates = createWindows(segments)
    .map((window) => {
      const primaryHook = strongestSentence(window.text).replace(/\s+/g, ' ').trim()
      const replyType = classifyReplyTypeFromText(window.text)
      const baseScore = baseWindowScore(window)
      const signal = getSignalBreakdown(window)
      const replyWeight = learningContext.weights[replyType] ?? 1
      const controversyWeight = learningContext.weights.controversy ?? 1
      const contradictionBoost = signal.contradiction
        ? 1 + Math.max(0, controversyWeight - 1) * 0.35
        : 1
      const finalMultiplier = replyWeight * contradictionBoost

      return {
        start: window.start,
        end: window.end,
        duration: window.duration,
        text: window.text,
        viralReasoning: buildViralReasoning(window),
        primaryHook,
        hookOptions: [primaryHook, rewriteContrarian(primaryHook), rewriteCuriosity(primaryHook)],
        commentBait: buildCommentBait(primaryHook, replyType),
        replyType,
        baseScore,
        score: toQualityScore(baseScore, finalMultiplier),
      } satisfies ClipCandidate
    })
    .sort((left, right) => right.score - left.score)

  const selected: ClipCandidate[] = []

  for (const candidate of candidates) {
    if (selected.every((existing) => !overlaps(existing, candidate))) {
      selected.push(candidate)
    }

    if (selected.length === clipCount) {
      break
    }
  }

  if (selected.length < clipCount) {
    for (const candidate of candidates) {
      const alreadyIncluded = selected.some(
        (existing) => existing.start === candidate.start && existing.end === candidate.end,
      )

      if (!alreadyIncluded) {
        selected.push(candidate)
      }

      if (selected.length === clipCount) {
        break
      }
    }
  }

  return selected
}
