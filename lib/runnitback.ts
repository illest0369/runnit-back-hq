export type AppRole = 'admin' | 'operator'

export type ChannelStatus = 'active' | 'paused' | 'archived'

export type PostWorkflowStatus =
  | 'INGESTED'
  | 'SCORING'
  | 'READY_FOR_CLIP_APPROVAL'
  | 'CLIP_APPROVED'
  | 'READY_FOR_POST_APPROVAL'
  | 'POST_APPROVED'
  | 'POSTING'
  | 'POSTED'
  | 'ANALYTICS_SYNCED'
  | 'SOURCED'
  | 'SELECTED'
  | 'GENERATED'
  | 'GUARDED'
  | 'REVIEWED'
  | 'AI_DECISION'
  | 'APPROVED_BY_HUMAN'
  | 'EXECUTED'
  | 'REJECTED'
  | 'FAILED'
  | 'REVISE'
  | 'queued'
  | 'approved'
  | 'processed'
  | 'ready_to_post'
  | 'sent_to_publish'
  | 'rejected'
  | 'sent_to_buffer'
  | 'posted'
  | 'failed'

export type PostRecommendation = 'approve' | 'revise' | 'reject'
export type PerformanceLabel = 'flop' | 'decent' | 'strong' | 'hit'
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW'
export type PostFeedback = 'up' | 'down'

export type CommentType = 'question' | 'hype' | 'hate' | 'controversy' | 'neutral'
export type CommentRecommendation = 'reply_now' | 'optional' | 'ignore'

export type AppChannel = {
  id: string
  name: string
  niche: string
  tiktok_profile_url: string | null
  buffer_profile_id: string | null
  status: ChannelStatus
}

export type AppPost = {
  id: string
  channel_id: string
  title?: string | null
  video_url: string | null
  clip_url?: string | null
  preview_url?: string | null
  cdn_url?: string | null
  local_url?: string | null
  source_video_url?: string | null
  tiktok_url: string | null
  hook: string
  hook_options?: string[]
  caption: string
  hashtags: string[]
  score: number
  performance_score: number
  performance_label: PerformanceLabel
  feedback_vote?: PostFeedback | null
  feedback_reason?: string | null
  status: PostWorkflowStatus
  comment_count_hint: number
  priority_score: number
  start_time?: number | null
  end_time?: number | null
  viral_reasoning?: string[]
  risk_notes?: string[]
  recommendation?: PostRecommendation
  source_suggestion_id?: string | null
  approved_by?: string | null
  approved_at?: string | null
  webhook_status?: string | null
  comment_bait?: {
    pinned: string
    replyStarter: string
  } | null
  reply_type?: CommentType | null
  thumbnail_url: string | null
  created_at: string
  updated_at?: string | null
  channel: AppChannel
}

export type AppUserSettings = {
  id: string
  user_id: string
  default_channel_id: string | null
  notifications_enabled: boolean
  view_preference: 'compact' | 'comfortable'
}

export type CommentIntelligence = {
  type: CommentType
  score: number
  recommendation: CommentRecommendation
}

export type ReplySessionPattern = {
  label: string
  count: number
}

export type ReplyAnalysis = {
  most_used_reply_types: ReplySessionPattern[]
  most_reused_suggestions: ReplySessionPattern[]
  most_repeated_final_replies: ReplySessionPattern[]
}

export type LearningWeight = {
  reply_type: CommentType
  weight: number
  total_score: number
  sample_count: number
}

export type ReplyLearningContext = {
  weights: Record<CommentType, number>
  successfulRepliesByType: Record<CommentType, string[]>
}

export const POST_STATUS_LABELS: Record<PostWorkflowStatus, string> = {
  INGESTED: 'Ingested',
  SCORING: 'Scoring',
  READY_FOR_CLIP_APPROVAL: 'Clip Review',
  CLIP_APPROVED: 'Clip Approved',
  READY_FOR_POST_APPROVAL: 'Post Review',
  POST_APPROVED: 'Post Approved',
  POSTING: 'Posting',
  POSTED: 'Posted',
  ANALYTICS_SYNCED: 'Analytics Synced',
  SOURCED: 'Sourced',
  SELECTED: 'Selected',
  GENERATED: 'Generated',
  GUARDED: 'Guarded',
  REVIEWED: 'Reviewed',
  AI_DECISION: 'AI Decision',
  APPROVED_BY_HUMAN: 'Human Approved',
  EXECUTED: 'Executed',
  REJECTED: 'Rejected',
  FAILED: 'Failed',
  REVISE: 'Revise',
  queued: 'Queued',
  approved: 'Approved',
  processed: 'Processed',
  ready_to_post: 'Ready To Post',
  sent_to_publish: 'Sent To Publish',
  rejected: 'Rejected',
  sent_to_buffer: 'Sent To Buffer',
  posted: 'Posted',
  failed: 'Failed',
}

export const POST_STATUS_STYLES: Record<PostWorkflowStatus, string> = {
  INGESTED: 'border-outline-variant text-on-surface-variant',
  SCORING: 'border-[#00cfff] text-[#00cfff]',
  READY_FOR_CLIP_APPROVAL: 'border-outline-variant text-on-surface-variant',
  CLIP_APPROVED: 'border-primary-container text-primary-container',
  READY_FOR_POST_APPROVAL: 'border-[#00ff88] text-[#00ff88]',
  POST_APPROVED: 'border-primary-container text-primary-container',
  POSTING: 'border-[#00cfff] text-[#00cfff]',
  POSTED: 'border-primary text-primary',
  ANALYTICS_SYNCED: 'border-primary text-primary',
  SOURCED: 'border-outline-variant text-on-surface-variant',
  SELECTED: 'border-outline-variant text-on-surface-variant',
  GENERATED: 'border-outline-variant text-on-surface-variant',
  GUARDED: 'border-[#00cfff] text-[#00cfff]',
  REVIEWED: 'border-[#00cfff] text-[#00cfff]',
  AI_DECISION: 'border-outline-variant text-on-surface-variant',
  APPROVED_BY_HUMAN: 'border-primary-container text-primary-container',
  EXECUTED: 'border-primary text-primary',
  REJECTED: 'border-error text-error',
  FAILED: 'border-error text-error',
  REVISE: 'border-secondary text-secondary',
  queued: 'border-outline-variant text-on-surface-variant',
  approved: 'border-primary-container text-primary-container',
  processed: 'border-outline-variant text-on-surface-variant',
  ready_to_post: 'border-[#00ff88] text-[#00ff88]',
  sent_to_publish: 'border-[#00cfff] text-[#00cfff]',
  rejected: 'border-error text-error',
  sent_to_buffer: 'border-secondary text-secondary',
  posted: 'border-primary text-primary',
  failed: 'border-error text-error',
}

export const PERFORMANCE_LABEL_STYLES: Record<PerformanceLabel, string> = {
  flop: 'border-white/15 text-white/50',
  decent: 'border-yellow-400/40 text-yellow-300',
  strong: 'border-[#00cfff]/45 text-[#00cfff]',
  hit: 'border-[#00ff88]/45 text-[#00ff88]',
}

export const COMMENT_RECOMMENDATION_LABELS: Record<CommentRecommendation, string> = {
  reply_now: 'Reply Now',
  optional: 'Optional',
  ignore: 'Ignore',
}

const QUESTION_PREFIXES = ['who', 'what', 'when', 'where', 'why', 'how', 'did', 'does', 'is', 'are', 'can']
const HYPE_PATTERNS = ['fire', 'cold', 'elite', 'goat', 'goated', 'insane', 'crazy', 'hard', 'w ', 'w.', 'let’s go', "let's go", 'lfg', 'tough']
const HATE_PATTERNS = ['trash', 'washed', 'garbage', 'ass', 'mid', 'sucks', 'terrible', 'awful', 'clown', 'lame', 'bum']
const CONTROVERSY_PATTERNS = ['rigged', 'robbed', 'biased', 'fixed', 'scripted', 'overrated', 'underrated', 'refs', 'ref ', 'cheat', 'fraud']
const HARD_IGNORE_PATTERNS = ['kill yourself', 'die', 'racist', 'slur']
const LEARNING_OUTCOME_SCORES: Record<string, number> = {
  thread: 3,
  got_reply: 2,
  got_like: 1,
  ignored: -1,
  replied: 0,
}

export function normalizeRole(role: string): AppRole {
  return role === 'admin' ? 'admin' : 'operator'
}

export function normalizeChannelStatus(status: string | null | undefined): ChannelStatus {
  if (status === 'paused' || status === 'archived') {
    return status
  }

  return 'active'
}

export function normalizePostStatus(status: string | null | undefined): PostWorkflowStatus {
  if (
    status === 'SOURCED' ||
    status === 'INGESTED' ||
    status === 'SCORING' ||
    status === 'READY_FOR_CLIP_APPROVAL' ||
    status === 'CLIP_APPROVED' ||
    status === 'READY_FOR_POST_APPROVAL' ||
    status === 'POST_APPROVED' ||
    status === 'POSTING' ||
    status === 'POSTED' ||
    status === 'ANALYTICS_SYNCED' ||
    status === 'SELECTED' ||
    status === 'GENERATED' ||
    status === 'GUARDED' ||
    status === 'REVIEWED' ||
    status === 'AI_DECISION' ||
    status === 'APPROVED_BY_HUMAN' ||
    status === 'EXECUTED' ||
    status === 'REJECTED' ||
    status === 'FAILED' ||
    status === 'REVISE' ||
    status === 'approved' ||
    status === 'processed' ||
    status === 'ready_to_post' ||
    status === 'sent_to_publish' ||
    status === 'rejected' ||
    status === 'sent_to_buffer' ||
    status === 'posted' ||
    status === 'failed'
  ) {
    return status
  }

  return 'queued'
}

export function normalizePostRecommendation(
  value: string | null | undefined,
): PostRecommendation {
  if (value === 'approve' || value === 'reject') {
    return value
  }

  return 'revise'
}

export function normalizePerformanceLabel(value: string | null | undefined): PerformanceLabel {
  if (value === 'hit' || value === 'strong' || value === 'decent') {
    return value
  }

  return 'flop'
}

export function performanceLabelForScore(score: number): PerformanceLabel {
  if (score >= 85) return 'hit'
  if (score >= 65) return 'strong'
  if (score >= 35) return 'decent'
  return 'flop'
}

export function confidenceLevelForScore(score: number): ConfidenceLevel {
  if (score >= 65) return 'HIGH'
  if (score >= 35) return 'MEDIUM'
  return 'LOW'
}

export function computePerformanceScore(input: {
  views: number
  likes: number
  shares: number
  watch_time: number
}) {
  const views = Math.max(0, input.views)
  const likes = Math.max(0, input.likes)
  const shares = Math.max(0, input.shares)
  const watchTime = Math.max(0, input.watch_time)

  const reachScore = Math.min(45, Math.log10(views + 1) * 9)
  const engagementRate = views > 0 ? (likes + shares * 2) / views : 0
  const engagementScore = Math.min(35, engagementRate * 700)
  const watchScore = Math.min(20, Math.log10(watchTime + 1) * 8)

  return Math.round(Math.min(100, reachScore + engagementScore + watchScore))
}

export function normalizeHashtags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split(/[,\s]+/)
      .map((entry) => entry.replace(/^#/, '').trim())
      .filter(Boolean)
  }

  return []
}

export function normalizeCommentBait(
  value: unknown,
): { pinned: string; replyStarter: string } | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Partial<{ pinned: string; replyStarter: string }>
  return {
    pinned: typeof candidate.pinned === 'string' ? candidate.pinned.trim() : '',
    replyStarter:
      typeof candidate.replyStarter === 'string' ? candidate.replyStarter.trim() : '',
  }
}

export function isDirectVideoAsset(url: string): boolean {
  return /\.(mp4|m4v|mov|webm)(\?.*)?$/i.test(url)
}

export function scoreComment(commentText: string): CommentIntelligence {
  const normalized = commentText.trim().toLowerCase()

  if (!normalized) {
    return {
      type: 'neutral',
      score: 0,
      recommendation: 'ignore',
    }
  }

  const firstWord = normalized.split(/\s+/)[0]
  const hasQuestionMark = normalized.includes('?')
  const hasQuestionPrefix = QUESTION_PREFIXES.includes(firstWord)
  const hasHype = HYPE_PATTERNS.some((pattern) => normalized.includes(pattern))
  const hasHate = HATE_PATTERNS.some((pattern) => normalized.includes(pattern))
  const hasControversy = CONTROVERSY_PATTERNS.some((pattern) => normalized.includes(pattern))
  const shouldIgnore = HARD_IGNORE_PATTERNS.some((pattern) => normalized.includes(pattern))

  let type: CommentType = 'neutral'
  if (hasControversy) {
    type = 'controversy'
  } else if (hasHate) {
    type = 'hate'
  } else if (hasQuestionMark || hasQuestionPrefix) {
    type = 'question'
  } else if (hasHype) {
    type = 'hype'
  }

  const lengthBoost = Math.min(Math.floor(normalized.length / 8), 18)

  if (type === 'controversy') {
    return {
      type,
      score: Math.min(96, 78 + lengthBoost),
      recommendation: 'reply_now',
    }
  }

  if (type === 'question') {
    return {
      type,
      score: Math.min(92, 70 + lengthBoost),
      recommendation: 'reply_now',
    }
  }

  if (type === 'hate') {
    return {
      type,
      score: Math.min(84, 58 + lengthBoost),
      recommendation: shouldIgnore ? 'ignore' : 'optional',
    }
  }

  if (type === 'hype') {
    return {
      type,
      score: Math.min(76, 46 + lengthBoost),
      recommendation: 'optional',
    }
  }

  return {
    type,
    score: Math.min(60, 28 + lengthBoost),
    recommendation: normalized.length > 50 ? 'optional' : 'ignore',
  }
}

function cleanSuggestion(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function defaultReplyWeights(): Record<CommentType, number> {
  return {
    question: 1,
    hype: 1,
    hate: 1,
    controversy: 1,
    neutral: 1,
  }
}

function clampWeight(value: number) {
  return Math.max(0.5, Math.min(2, value))
}

function orderedReplyTypes(weights: Record<CommentType, number>, currentType: CommentType) {
  const allTypes = (Object.keys(weights) as CommentType[]).sort(
    (left, right) => weights[right] - weights[left],
  )

  return [currentType, ...allTypes.filter((type) => type !== currentType)]
}

function topSuccessfulReplies(
  context: ReplyLearningContext | undefined,
  type: CommentType,
) {
  return (context?.successfulRepliesByType[type] ?? [])
    .map(cleanSuggestion)
    .filter(Boolean)
    .slice(0, 2)
}

export function classifyReplyTypeFromText(text: string): CommentType {
  const normalized = text.trim().toLowerCase()

  if (!normalized) {
    return 'neutral'
  }

  if (
    normalized === 'question' ||
    normalized === 'hype' ||
    normalized === 'hate' ||
    normalized === 'controversy' ||
    normalized === 'neutral'
  ) {
    return normalized
  }

  if (CONTRADICTION_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return 'controversy'
  }

  if (normalized.includes('?') || QUESTION_PREFIXES.some((prefix) => normalized.startsWith(`${prefix} `))) {
    return 'question'
  }

  if (HYPE_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return 'hype'
  }

  if (HATE_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return 'hate'
  }

  return 'neutral'
}

const CONTRADICTION_PATTERNS = [...CONTROVERSY_PATTERNS, 'but', 'actually', 'however']

export function buildLearningWeights(
  rows: Array<{
    reply_type: string
    outcome_types: string[]
  }>,
): LearningWeight[] {
  const totals = new Map<CommentType, { total: number; count: number }>()

  ;(['question', 'hype', 'hate', 'controversy', 'neutral'] as CommentType[]).forEach(
    (type) => {
      totals.set(type, { total: 0, count: 0 })
    },
  )

  rows.forEach((row) => {
    const replyType = classifyReplyTypeFromText(row.reply_type)
    const entry = totals.get(replyType)
    if (!entry) {
      return
    }

    const totalScore = row.outcome_types.reduce(
      (score, outcomeType) => score + (LEARNING_OUTCOME_SCORES[outcomeType] ?? 0),
      0,
    )

    entry.total += totalScore
    entry.count += 1
  })

  return [...totals.entries()].map(([reply_type, value]) => ({
    reply_type,
    total_score: value.total,
    sample_count: value.count,
    weight: clampWeight(value.count === 0 ? 1 : value.total / value.count),
  }))
}

export function buildReplyLearningContext(input: {
  weights?: LearningWeight[]
  successfulRepliesByType?: Partial<Record<CommentType, string[]>>
}): ReplyLearningContext {
  const weights = defaultReplyWeights()
  ;(input.weights ?? []).forEach((item) => {
    weights[item.reply_type] = clampWeight(item.weight)
  })

  return {
    weights,
    successfulRepliesByType: {
      question: input.successfulRepliesByType?.question ?? [],
      hype: input.successfulRepliesByType?.hype ?? [],
      hate: input.successfulRepliesByType?.hate ?? [],
      controversy: input.successfulRepliesByType?.controversy ?? [],
      neutral: input.successfulRepliesByType?.neutral ?? [],
    },
  }
}

export function generateReplySuggestions(input: {
  channelName: string
  hook: string
  commentText: string
  intelligence: CommentIntelligence
  learningContext?: ReplyLearningContext
}): string[] {
  const hook = input.hook.trim() || 'the clip'
  const opener = input.channelName.trim()
  const replyTypes = orderedReplyTypes(
    input.learningContext?.weights ?? defaultReplyWeights(),
    input.intelligence.type,
  )

  const suggestionsByType: Record<CommentType, string[]> = {
    question: [
      `Fair question. ${hook} was the whole point, and that’s why we framed it this way.`,
      `Short answer: yes, and ${hook.toLowerCase()} is why people are split on it.`,
      `That’s exactly the debate. ${opener} is looking at ${hook.toLowerCase()} from the angle people skip.`,
    ],
    hype: [
      `Appreciate that. ${hook} was too clean not to post.`,
      `That’s the energy. ${hook} deserved a replay and a second look.`,
      `Exactly. ${opener} saw the same thing and had to run it back.`,
    ],
    hate: [
      `That’s fair if it didn’t hit for you, but ${hook.toLowerCase()} is why the clip made the cut.`,
      `Respect the take. We looked at ${hook.toLowerCase()} as the talking point, not just the highlight.`,
      `Could be a miss for some people. We still think ${hook.toLowerCase()} makes it worth the discussion.`,
    ],
    controversy: [
      `That’s why the clip matters. ${hook} is the part people keep arguing about.`,
      `There’s a real split on this. We leaned into ${hook.toLowerCase()} because it changes how the moment lands.`,
      `Totally get why that starts debate. ${opener} is framing the tension around ${hook.toLowerCase()}, not dodging it.`,
    ],
    neutral: [
      `That’s part of why ${hook.toLowerCase()} stood out to us.`,
      `Good catch. ${hook} is where the post really starts.`,
      `That’s the lane here. ${opener} is trying to keep the focus on ${hook.toLowerCase()}.`,
    ],
  }

  return replyTypes
    .flatMap((type) => [
      ...topSuccessfulReplies(input.learningContext, type),
      ...suggestionsByType[type],
    ])
    .map(cleanSuggestion)
    .filter((suggestion, index, list) => suggestion && list.indexOf(suggestion) === index)
    .slice(0, 3)
}

export function analyzeReplies(
  sessions: Array<{
    comment_type: string
    generated_suggestions: unknown
    final_reply_text: string | null
  }>,
): ReplyAnalysis {
  const replyTypeCounts = new Map<string, number>()
  const suggestionCounts = new Map<string, number>()
  const finalReplyCounts = new Map<string, number>()

  sessions.forEach((session) => {
    const type = session.comment_type || 'neutral'
    replyTypeCounts.set(type, (replyTypeCounts.get(type) ?? 0) + 1)

    normalizeHashtags(session.generated_suggestions).forEach((suggestion) => {
      suggestionCounts.set(suggestion, (suggestionCounts.get(suggestion) ?? 0) + 1)
    })

    const finalReply = cleanSuggestion(session.final_reply_text ?? '')
    if (finalReply) {
      finalReplyCounts.set(finalReply, (finalReplyCounts.get(finalReply) ?? 0) + 1)
    }
  })

  const toPatterns = (entries: Map<string, number>): ReplySessionPattern[] =>
    [...entries.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([label, count]) => ({ label, count }))

  return {
    most_used_reply_types: toPatterns(replyTypeCounts),
    most_reused_suggestions: toPatterns(suggestionCounts),
    most_repeated_final_replies: toPatterns(finalReplyCounts),
  }
}
