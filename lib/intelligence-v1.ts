import { getChannelMeta } from './channel-meta'
import {
  getStoredTikTokAnalysis,
  type TikTokAnalyzerOutput,
  type TikTokReasonTag,
} from './tiktok-analyzer'

export type RBHQIntelligenceRankLabel = 'must_post' | 'strong' | 'solid' | 'low_priority'
export type RBHQIntelligenceUrgency = 'post_now' | 'today' | 'evergreen' | 'hold'
export type RBWomenContentPillar =
  | 'debate'
  | 'player_personality'
  | 'elite_basketball'
  | 'college_basketball'
  | 'women_sports_expansion'
export type RBWomenDecisionBand = 'high_confidence' | 'operator_review' | 'hold_unless_timely' | 'reject'
export type RBWomenHookType = 'reaction' | 'debate' | 'search_first'
export type RBWomenScoutLabel = 'post_now' | 'develop' | 'hold'
export type RBWomenEditorialAngle =
  | 'race and representation'
  | 'media power'
  | 'unequal visibility'
  | 'star treatment'
  | 'labor and leadership'
  | 'credit distribution'
  | 'who gets protected or criticized'
  | 'popularity versus production'
  | 'basketball evidence'
export type RBWomenExpectedEngagementType =
  | 'argumentative_comments'
  | 'quote_reactions'
  | 'highlight_replays'
  | 'story_discussion'
  | 'low_engagement'
export type RBSportsScoutLabel = 'post_now' | 'develop' | 'hold'
export type RBSportsDecisionBand = 'high_confidence' | 'operator_review' | 'hold_unless_timely' | 'reject'
export type RBSportsEditorialAngle =
  | 'breaking reaction'
  | 'clutch proof'
  | 'bad call / officiating heat'
  | 'rivalry heat'
  | 'trade / roster movement'
  | 'injury / return'
  | 'playoff stakes'
  | 'star performance'
  | 'upset reaction'
  | 'coach/player quote'
  | 'fan debate'
  | 'highlight evidence'

export type RBSportsIntelligenceMetadata = {
  model: 'rb_sports_content_intelligence_v1'
  channelKey: 'rb_sports'
  tiktokHandle: '@runnitbacksports'
  rbAngle: RBSportsEditorialAngle
  scoutLabel: RBSportsScoutLabel
  scoutingWindowHours: 48
  breakingWindowHours: 6
  primarySearchTopic: string
  clipTopic: string
  playerEntity: string | null
  teamEntity: string | null
  coachEntity: string | null
  leagueEntity: string | null
  entityType: 'player' | 'team' | 'coach' | 'league' | 'transaction' | 'injury' | 'unknown'
  decisionBand: RBSportsDecisionBand
  scoring: {
    positive: Record<string, number>
    penalties: Record<string, number>
    rawScore: number
  }
}

export type RBWomenIntelligenceMetadata = {
  model: 'rb_women_content_intelligence_v1'
  channelKey: 'rb_women'
  tiktokHandle: '@runnitbackwomen'
  contentPillar: RBWomenContentPillar
  hookType: RBWomenHookType
  hooks: Record<RBWomenHookType, string>
  featuredPlayer: string | null
  featuredPlayers: string[]
  debateTopic: string | null
  rbAngle: RBWomenEditorialAngle
  scoutLabel: RBWomenScoutLabel
  scoutingWindowHours: 72
  primarySearchTopic: string
  clipDurationSeconds: number | null
  expectedEngagementType: RBWomenExpectedEngagementType
  decisionBand: RBWomenDecisionBand
  scoring: {
    positive: Record<string, number>
    penalties: Record<string, number>
    rawScore: number
  }
  suggestedPinnedComment: string
  recommendedCommentPrompt: string
}

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
  rbWomen?: RBWomenIntelligenceMetadata
  rbSports?: RBSportsIntelligenceMetadata
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
  clipTopic: string
  playerEntity: string | null
  teamEntity?: string | null
  scoutLabel: RBWomenScoutLabel
  rbAngle: string | null
  channelId: string | null
  lane: string
  sourceName: string | null
  score: number
  rankLabel: RBHQIntelligenceRankLabel
  urgency: RBHQIntelligenceUrgency
  reasons: string[]
  whyNow: string
  whyThisShouldPostNow: string
  operatorSummary: string
  suggestedCaption: string
  captionDraft: string
  suggestedHashtags: string[]
  hashtagPack: string[]
  packageRenderStatus: {
    packageId: string | null
    clipPrepStatus: string | null
    localRenderStatus: string | null
    localRenderAttached: boolean
    localAssetPath: string | null
  }
  transcriptSourceStatus: {
    subtitleSource: string | null
    transcriptTimed: boolean | null
    sourceType: string | null
    sourceStatus: string | null
  }
  reviewReason: string | null
  status?: string | null
  publishStatus?: string | null
  createdAt?: string | null
}

export type SourceCandidateSummary = {
  id: string
  title: string
  videoUrl: string
  thumbnailUrl: string | null
  publishedAt: string | null
  sourceName: string
  sourceChannelKey?: string | null
  sourceActive?: boolean | null
  targetLane: string | null
  score: number
  rankLabel: RBHQIntelligenceRankLabel
  urgency: RBHQIntelligenceUrgency
  hook: string
  playerEntity?: string | null
  teamEntity?: string | null
  scoutLabel?: RBWomenScoutLabel | null
  rbAngle?: RBWomenEditorialAngle | RBSportsEditorialAngle | null
  packageRenderStatus?: DailyContentPlanClip['packageRenderStatus']
  transcriptSourceStatus?: DailyContentPlanClip['transcriptSourceStatus']
  reviewReason?: string | null
  suggestedCaption: string
  suggestedHashtags: string[]
  whyNow: string
  operatorSummary: string
}

export type DailyContentPlan = {
  generatedAt: string
  topClipsToPostNow: DailyContentPlanClip[]
  strongAlternates: DailyContentPlanClip[]
  holdOrLowPriority: DailyContentPlanClip[]
  laneBalanceNotes: string[]
  suggestedPostingOrder: DailyContentPlanClip[]
  sourceCandidates: SourceCandidateSummary[]
}

export const RBHQ_INTELLIGENCE_V1_NOTE_PREFIX = 'rbhq_intelligence_v1:'

const EDITORIAL_CAPTION_PREFIX = 'editorial_caption:'
const EDITORIAL_HASHTAGS_PREFIX = 'editorial_hashtags:'
const CANDIDATE_CAPTION_PREFIX = 'candidate_caption:'
const CANDIDATE_HASHTAGS_PREFIX = 'candidate_hashtags:'
const MAX_REASON_COUNT = 6

type ViralSignalKey =
  | 'breaking_news'
  | 'trade_roster'
  | 'injury_return'
  | 'clutch_upset'
  | 'rivalry_conflict'
  | 'fan_reaction'
  | 'championship_playoff_tournament'
  | 'debut_record_milestone'
  | 'gaming_update'
  | 'source_authority'
  | 'freshness'
  | 'topic_momentum'

type ViralSignalCategory = {
  key: ViralSignalKey
  label: string
  caption: string
  hashtags: string[]
  patterns: string[]
  scoreBoost: number
  timingWeight: number
  lanes?: string[]
}

const EVENT_PATTERNS = [
  'breaking',
  'just in',
  'latest',
  'report',
  'reports',
  'reported',
  'trade',
  'traded',
  'transfer',
  'transfers',
  'signed',
  'signs',
  'signing',
  'fired',
  'waived',
  'released',
  'roster',
  'upset',
  'stunner',
  'injury',
  'injured',
  'questionable',
  'ruled out',
  'returns',
  'return',
  'back in',
  'debut',
  'rookie',
  'record',
  'milestone',
  'first career',
  'first ever',
  'youngest',
  'oldest',
  'historic',
  'history',
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
  'fans',
  'crowd',
  'rage',
  'nerf',
  'patch',
  'reveal',
  'trailer',
  'tournament',
  'championship',
  'playoff',
  'playoffs',
  'finals',
  'semifinal',
  'semifinals',
  'grand final',
  'title',
  'cup',
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

const VIRAL_SIGNAL_CATEGORIES: ViralSignalCategory[] = [
  {
    key: 'breaking_news',
    label: 'breaking/news',
    caption: 'breaking reaction',
    hashtags: ['#Breaking', '#News'],
    patterns: ['breaking', 'just in', 'latest', 'report:', 'reports', 'reported', 'per ', 'sources say', 'confirmed'],
    scoreBoost: 8,
    timingWeight: 5,
  },
  {
    key: 'trade_roster',
    label: 'trade/roster',
    caption: 'trade reaction',
    hashtags: ['#TradeTalk', '#RosterMoves'],
    patterns: ['trade', 'traded', 'transfer', 'transfers', 'signed', 'signs', 'signing', 'fired', 'waived', 'released', 'roster'],
    scoreBoost: 7,
    timingWeight: 5,
  },
  {
    key: 'injury_return',
    label: 'injury/return',
    caption: 'injury update',
    hashtags: ['#InjuryUpdate', '#ReturnWatch'],
    patterns: ['injury', 'injured', 'questionable', 'ruled out', 'returns', 'return', 'back in', 'cleared'],
    scoreBoost: 7,
    timingWeight: 5,
  },
  {
    key: 'clutch_upset',
    label: 'clutch/upset',
    caption: 'clutch upset',
    hashtags: ['#Clutch', '#Upset'],
    patterns: ['upset', 'stunner', 'clutch', 'walkoff', 'walk-off', 'comeback'],
    scoreBoost: 6,
    timingWeight: 4,
  },
  {
    key: 'rivalry_conflict',
    label: 'rivalry/conflict',
    caption: 'rivalry reaction',
    hashtags: ['#Rivalry', '#Reaction'],
    patterns: ['rivalry', 'rival', 'beef', 'trash talk', 'heated', 'controversy', 'controversial', 'calls out', 'called out', 'faceoff', 'face off'],
    scoreBoost: 6,
    timingWeight: 4,
  },
  {
    key: 'fan_reaction',
    label: 'fan reaction',
    caption: 'fan reaction',
    hashtags: ['#FanReaction', '#Reaction'],
    patterns: ['reaction', 'reacts', 'viral', 'rage', 'fans', 'crowd', 'erupts', 'goes crazy', 'losing it'],
    scoreBoost: 4,
    timingWeight: 3,
  },
  {
    key: 'championship_playoff_tournament',
    label: 'championship/playoff/tournament',
    caption: 'tournament reaction',
    hashtags: ['#Playoffs', '#Tournament'],
    patterns: ['championship', 'playoff', 'playoffs', 'finals', 'semifinal', 'semifinals', 'grand final', 'tournament', 'title', 'cup', 'bracket'],
    scoreBoost: 5,
    timingWeight: 3,
  },
  {
    key: 'debut_record_milestone',
    label: 'debut/record/milestone',
    caption: 'milestone reaction',
    hashtags: ['#Milestone', '#RecordWatch'],
    patterns: ['debut', 'rookie', 'record', 'milestone', 'first career', 'first ever', 'youngest', 'oldest', 'historic', 'history'],
    scoreBoost: 5,
    timingWeight: 3,
  },
  {
    key: 'gaming_update',
    label: 'gaming update',
    caption: 'patch reaction',
    hashtags: ['#PatchNotes', '#GamingNews'],
    patterns: ['nerf', 'patch', 'reveal', 'trailer'],
    scoreBoost: 4,
    timingWeight: 4,
    lanes: ['arena'],
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

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
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

function containsAny(text: string, patterns: string[]): boolean {
  return countPatternHits(text, patterns) > 0
}

const RB_WOMEN_RECOGNIZABLE_PLAYERS = [
  "a'ja wilson",
  'aja wilson',
  'angel reese',
  'caitlin clark',
  'kayla mcbride',
  'olivia miles',
  'sabrina ionescu',
  'breanna stewart',
  'napheesa collier',
  'kelsey plum',
  'diana taurasi',
  'arike ogunbowale',
  'skylar diggins',
  'aliyah boston',
  'kamilla cardoso',
  'cameron brink',
  'kahleah copper',
  'nneka ogwumike',
  'rhyne howard',
  'allisha gray',
  'paige bueckers',
  'juju watkins',
  'flaujae johnson',
  'flau’jae johnson',
  'flau\'jae johnson',
  'kiki iriafen',
  'kelsey mitchell',
  'alex morgan',
  'simone biles',
  'coco gauff',
  'naomi osaka',
]

const RB_WOMEN_DISPLAY_NAMES: Record<string, string> = {
  "a'ja wilson": "A'ja Wilson",
  'aja wilson': "A'ja Wilson",
  'kayla mcbride': 'Kayla McBride',
  'olivia miles': 'Olivia Miles',
  'caitlin clark': 'Caitlin Clark',
  'paige bueckers': 'Paige Bueckers',
  'alex morgan': 'Alex Morgan',
  'sabrina ionescu': 'Sabrina Ionescu',
  'breanna stewart': 'Breanna Stewart',
  'napheesa collier': 'Napheesa Collier',
  'kelsey plum': 'Kelsey Plum',
  'diana taurasi': 'Diana Taurasi',
  'arike ogunbowale': 'Arike Ogunbowale',
  'skylar diggins': 'Skylar Diggins',
  'aliyah boston': 'Aliyah Boston',
  'kamilla cardoso': 'Kamilla Cardoso',
  'cameron brink': 'Cameron Brink',
  'kahleah copper': 'Kahleah Copper',
  'nneka ogwumike': 'Nneka Ogwumike',
  'rhyne howard': 'Rhyne Howard',
  'allisha gray': 'Allisha Gray',
  'flaujae johnson': 'Flau\'jae Johnson',
  'flau’jae johnson': 'Flau\'jae Johnson',
  'flau\'jae johnson': 'Flau\'jae Johnson',
  'kiki iriafen': 'Kiki Iriafen',
  'kelsey mitchell': 'Kelsey Mitchell',
}

const RB_WOMEN_CONFLICT_TERMS = [
  'debate',
  'argue',
  'split',
  'controversial',
  'controversy',
  'foul',
  'fouls',
  'officiating',
  'ref',
  'refs',
  'whistle',
  'fair',
  'fairness',
  'treatment',
  'called out',
  'responds',
  'response',
  'versus',
  ' vs ',
  'rookie',
  'veteran',
  'matchup',
]

const RB_WOMEN_VISUAL_TERMS = [
  'block',
  'steal',
  'finish',
  'layup',
  'three',
  '3-pointer',
  'dunk',
  'crossover',
  'defense',
  'defensive',
  'clutch',
  'highlight',
  'play',
  'bucket',
  'buzzer',
  'contact',
  'physical',
  'matchup',
]

const RB_WOMEN_COMMENT_TERMS = [
  'comment',
  'fans',
  'timeline',
  'split',
  'debate',
  'argue',
  'fair',
  'wrong',
  'quote',
  'said',
  'joked',
  'laughing',
  'called out',
  'reacted',
  'reactions',
]

const RB_WOMEN_EMOTIONAL_CULTURE_TERMS = [
  'laughing',
  'joked',
  'joke',
  'personality',
  'culture',
  'viral',
  'emotional',
  'disrespect',
  'confidence',
  'pressure',
  'room',
  'quote',
  'representation',
  'meaning',
  'fans',
  'treatment',
  'dispute',
  'coverage',
  'media narrative',
  'visibility',
  'star system',
  'credit',
  'protected',
  'criticized',
  'production',
  'assist',
]

const RB_WOMEN_GENERIC_NEWS_TERMS = [
  'announces',
  'announced',
  'announcement',
  'schedule',
  'broadcast',
  'ticket',
  'tickets',
  'merch',
  'merchandise',
  'sponsor',
  'sponsored',
  'presented by',
  'regular season details',
  'league update',
  'community appearance',
  'community event',
  'meet and greet',
  'practice footage',
  'routine practice',
]

const RB_WOMEN_COLLEGE_TERMS = [
  'ncaa',
  'college basketball',
  'women\'s basketball',
  'march madness',
  'final four',
  'uconn',
  'lsu',
  'usc',
]

const RB_WOMEN_EXPANSION_TERMS = [
  'nwsl',
  'women\'s soccer',
  'women soccer',
  'women sports',
  'women\'s sports',
  'coverage gap',
  'media coverage',
  'league growth',
  'expansion',
]

const RB_WOMEN_CONTEXT_HEAVY_TERMS = [
  'to understand',
  'need the prior',
  'needs the prior',
  'requires context',
  'months of background',
  'background',
  'cba',
  'salary cap',
  'hardship rule',
  'roster rule',
  'explained',
  'long livestream',
  'livestream',
  'live stream',
  'full episode',
  'without timestamps',
]

const RB_WOMEN_STATIC_TALK_TERMS = [
  'press conference',
  'podcast',
  'interview',
  'talking',
  'explains',
  'explained',
]

function rbWomenFeaturedPlayer(text: string): string | null {
  return rbWomenFeaturedPlayers(text)[0] ?? null
}

function rbWomenDisplayName(matched: string): string {
  const displayName = RB_WOMEN_DISPLAY_NAMES[matched]
  if (displayName) return displayName
  if (matched === 'nwsl') return 'NWSL'
  return matched.split(' ').map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ')
}

function rbWomenFeaturedPlayers(text: string): string[] {
  const players: string[] = []
  for (const player of RB_WOMEN_RECOGNIZABLE_PLAYERS) {
    if (!text.includes(player)) continue
    const displayName = rbWomenDisplayName(player)
    if (!players.includes(displayName)) players.push(displayName)
  }
  return players
}

function rbWomenPlayersFromInput(input: RBHQIntelligenceInput): {
  featuredPlayers: string[]
  titlePlayers: string[]
} {
  const titleText = [
    input.title,
    input.source_title,
    input.hook,
    input.recommended_hook,
  ].map(compact).join(' ').toLowerCase()
  const titlePlayers = rbWomenFeaturedPlayers(titleText)
  const allPlayers = rbWomenFeaturedPlayers(textForSignals(input))
  return {
    titlePlayers,
    featuredPlayers: [...titlePlayers, ...allPlayers.filter((player) => !titlePlayers.includes(player))],
  }
}

function rbWomenTeamOrLeagueTags(input: RBHQIntelligenceInput, text: string): string[] {
  const tags: string[] = []
  const league = compact(input.league)
  if (league) tags.push(`#${league.replace(/[^A-Za-z0-9]/g, '')}`)
  if (containsAny(text, ['wnba'])) tags.push('#WNBA')
  if (containsAny(text, ['ncaa', 'college basketball', 'women\'s basketball']) || /ncaa/i.test(compact(input.source_name))) tags.push('#NCAAWBB')
  if (containsAny(text, ['nwsl', 'women\'s soccer', 'women soccer']) || league.toLowerCase() === 'nwsl') tags.push('#NWSL')
  return tags
}

function rbWomenTopicHashtag(pillar: RBWomenContentPillar, debateTopic: string | null, text: string): string | null {
  if (debateTopic === 'officiating/fairness') return '#WNBADebate'
  if (debateTopic === 'veteran-versus-rookie') return '#WNBARookies'
  if (pillar === 'elite_basketball') return '#BasketballHighlights'
  if (pillar === 'college_basketball') return '#NCAAWBB'
  if (pillar === 'women_sports_expansion') return containsAny(text, ['soccer', 'nwsl']) ? '#WomenSoccer' : '#WomenSports'
  return null
}

function rbWomenPrimarySearchTopic(input: RBHQIntelligenceInput, featuredPlayers: string[], debateTopic: string | null, pillar: RBWomenContentPillar, text: string): string {
  if (featuredPlayers.length >= 2 && (debateTopic === 'veteran-versus-rookie' || debateTopic === 'player-versus-player')) {
    return `${featuredPlayers[0]} vs ${featuredPlayers[1]} matchup`
  }
  const featuredPlayer = featuredPlayers[0] ?? null
  if (featuredPlayer) {
    if (containsAny(text, ['star system', 'popularity versus production', 'popularity vs production'])) return `${featuredPlayer} popularity versus production`
    if (containsAny(text, ['unequal visibility', 'visibility', 'national conversation'])) return `${featuredPlayer} visibility gap`
    if (rbWomenProductionSignal(text)) return `${featuredPlayer} production`
    if (containsAny(text, ['credit distribution', 'assist', 'assists'])) return `${featuredPlayer} credit distribution`
    if (debateTopic === 'officiating/fairness') return `${featuredPlayer} WNBA foul debate`
    if (debateTopic === 'veteran-versus-rookie') return `${featuredPlayer} veteran rookie matchup`
    if (containsAny(text, ['representation'])) return `${featuredPlayer} representation quote`
    if (containsAny(text, ['media coverage', 'coverage gap'])) return `${featuredPlayer} media coverage`
    if (containsAny(text, ['quote', 'said'])) return `${featuredPlayer} quote`
    return `${featuredPlayer} ${pillar.replace(/_/g, ' ')}`
  }
  if (containsAny(text, ['broadcast', 'schedule'])) return 'WNBA broadcast schedule'
  if (pillar === 'college_basketball') return 'women college basketball'
  if (pillar === 'women_sports_expansion') return 'women sports expansion'
  return compact(input.league || input.sport || 'RB Women clip')
}

function rbWomenProductionSignal(text: string): boolean {
  return (
    containsAny(text, ['production', 'efficiency', 'stat line', 'box score', 'performance']) ||
    /\b\d{2}[-\s]*(pt|pts|point|points|rebounds|assists|ast|rebs)\b/.test(text)
  )
}

function rbWomenStrongQuote(text: string): boolean {
  return containsAny(text, ['quote', 'said', 'did not hold back', 'joked', 'called out', 'responds', 'response', 'made the media coverage point'])
}

function rbWomenEditorialAngle(text: string, pillar: RBWomenContentPillar): RBWomenEditorialAngle {
  const representationText = text
    .replace(/\bwithout forcing a race-only read\b/g, '')
    .replace(/\bwithout forcing race-only framing\b/g, '')
    .replace(/\bnot forcing a race-only read\b/g, '')
    .replace(/\bnot forcing race-only framing\b/g, '')
  if (containsAny(text, ['popularity versus production', 'popularity vs production', 'all-star', 'all star', 'star system', 'production vs'])) return 'popularity versus production'
  if (containsAny(text, ['unequal visibility', 'visibility gap', 'national conversation', 'attention centers elsewhere', 'coverage gap'])) return 'unequal visibility'
  if (containsAny(text, ['assist', 'assists', 'credit distribution', 'who gets credit', 'credited'])) return 'credit distribution'
  if (containsAny(text, ['media power', 'media coverage', 'media narrative', 'coverage'])) return 'media power'
  if (containsAny(text, ['protected', 'criticized', 'criticism', 'called out'])) return 'who gets protected or criticized'
  if (containsAny(text, ['labor', 'leadership', 'cba', 'union', 'captain'])) return 'labor and leadership'
  if (containsAny(representationText, [
    'race and representation',
    'racial',
    'representation',
    'black women',
    'black athlete',
    'women of color',
  ])) return 'race and representation'
  if (containsAny(text, ['star treatment', 'superstar whistle', 'special whistle'])) return 'star treatment'
  if (pillar === 'elite_basketball' || rbWomenProductionSignal(text) || containsAny(text, ['rebound', 'points', 'bucket'])) return 'basketball evidence'
  return 'basketball evidence'
}

function rbWomenScoutLabel(decisionBand: RBWomenDecisionBand): RBWomenScoutLabel {
  if (decisionBand === 'high_confidence') return 'post_now'
  if (decisionBand === 'operator_review') return 'develop'
  return 'hold'
}

function rbWomenHasClearFootageOrQuote(text: string): boolean {
  return containsAny(text, [
    ...RB_WOMEN_VISUAL_TERMS,
    'quote',
    'said',
    'press conference',
    'clip',
    'footage',
    'assist',
    'production',
  ])
}

function rbWomenHasUsefulSegment(input: RBHQIntelligenceInput): boolean {
  return typeof input.duration_seconds !== 'number' || (input.duration_seconds >= 10 && input.duration_seconds <= 45)
}

function rbWomenHumanAngle(text: string, featuredPlayer: string | null): boolean {
  return Boolean(featuredPlayer) || containsAny(text, ['player', 'athlete', 'coach', 'fans', 'human angle'])
}

function rbWomenIsCollegeBasketball(input: RBHQIntelligenceInput, text: string): boolean {
  return containsAny(text, RB_WOMEN_COLLEGE_TERMS) || /ncaa|college/i.test(compact(input.league || input.source_name))
}

function rbWomenIsExpansionStory(input: RBHQIntelligenceInput, text: string): boolean {
  const sport = compact(input.sport).toLowerCase()
  const league = compact(input.league).toLowerCase()
  return containsAny(text, RB_WOMEN_EXPANSION_TERMS) || (sport.length > 0 && sport !== 'basketball') || (league.length > 0 && !['wnba', 'ncaa wbb'].includes(league))
}

function rbWomenDebateTopic(text: string): string | null {
  if (containsAny(text, ['foul', 'fouls', 'officiating', 'ref', 'refs', 'whistle', 'fairness', 'fair', 'treatment'])) return 'officiating/fairness'
  if (containsAny(text, ['assist', 'assists', 'credit distribution', 'who gets credit'])) return 'credit distribution'
  if (containsAny(text, ['popularity versus production', 'popularity vs production', 'star system', 'all-star', 'all star', 'production vs'])) return 'popularity versus production'
  if (containsAny(text, ['visibility', 'national conversation', 'attention centers elsewhere', 'coverage gap', 'media coverage', 'media narrative'])) return 'media power/visibility'
  if (containsAny(text, ['rookie', 'veteran'])) return 'veteran-versus-rookie'
  if (containsAny(text, ['versus', ' vs ', 'matchup', 'player-versus-player'])) return 'player-versus-player'
  if (containsAny(text, ['defense', 'defensive', 'block', 'steal'])) return 'defense'
  if (containsAny(text, ['quote', 'said', 'responds', 'called out'])) return 'quote reaction'
  return containsAny(text, ['debate', 'argue', 'split', 'controversial', 'controversy']) ? 'fan debate' : null
}

function rbWomenPillar(input: RBHQIntelligenceInput, text: string, featuredPlayer: string | null, debateTopic: string | null): RBWomenContentPillar {
  const personalityMoment = containsAny(text, ['joke', 'joked', 'laughing', 'personality', 'culture', 'quote', 'room laughing'])
  const hardDebateMoment = containsAny(text, ['foul', 'officiating', 'fair', 'versus', ' vs ', 'treatment', 'called out'])
  if (debateTopic && containsAny(text, ['foul', 'officiating', 'fair', 'rookie', 'veteran', 'versus', ' vs ', 'treatment', 'called out'])) return 'debate'
  if (rbWomenIsExpansionStory(input, text)) return 'women_sports_expansion'
  if (personalityMoment || rbWomenStrongQuote(text)) return 'player_personality'
  if (containsAny(text, RB_WOMEN_VISUAL_TERMS) && featuredPlayer) return 'elite_basketball'
  if (rbWomenIsCollegeBasketball(input, text)) return 'college_basketball'
  if (genericRbWomenStory(text)) return 'women_sports_expansion'
  if (hardDebateMoment) return 'debate'
  return 'women_sports_expansion'
}

function rbWomenExpectedEngagementType(pillar: RBWomenContentPillar, debateTopic: string | null, text: string): RBWomenExpectedEngagementType {
  if (pillar === 'player_personality') return 'quote_reactions'
  if (pillar === 'women_sports_expansion') return containsAny(text, RB_WOMEN_GENERIC_NEWS_TERMS) ? 'low_engagement' : 'story_discussion'
  if (debateTopic || pillar === 'debate') return 'argumentative_comments'
  if (pillar === 'elite_basketball') return 'highlight_replays'
  if (containsAny(text, RB_WOMEN_GENERIC_NEWS_TERMS)) return 'low_engagement'
  return 'story_discussion'
}

function rbWomenDecisionBand(score: number): RBWomenDecisionBand {
  if (score >= 80) return 'high_confidence'
  if (score >= 65) return 'operator_review'
  if (score >= 50) return 'hold_unless_timely'
  return 'reject'
}

function rbWomenRankForBand(band: RBWomenDecisionBand, score: number): RBHQIntelligenceRankLabel {
  if (band === 'high_confidence') return 'must_post'
  if (band === 'operator_review') return score >= 76 ? 'strong' : 'solid'
  return 'low_priority'
}

function rbWomenUrgencyForBand(band: RBWomenDecisionBand): RBHQIntelligenceUrgency {
  if (band === 'high_confidence') return 'post_now'
  if (band === 'operator_review') return 'today'
  return 'hold'
}

function rbWomenHooks(input: {
  hook: string
  title: string
  featuredPlayer: string | null
  featuredPlayers: string[]
  debateTopic: string | null
  primarySearchTopic: string
  pillar: RBWomenContentPillar
}): Record<RBWomenHookType, string> {
  const subject = input.featuredPlayer || compact(input.hook || input.title || 'This moment')
  const topic = input.debateTopic || input.pillar.replace(/_/g, ' ')
  const matchup = input.featuredPlayers.length >= 2 ? `${input.featuredPlayers[0]} and ${input.featuredPlayers[1]}` : subject
  return {
    reaction: truncate(input.featuredPlayer ? `${matchup} had fans reacting for a reason.` : sentenceLead(subject), 110),
    debate: truncate(input.debateTopic ? `Where do you land on this ${topic} moment?` : `Is this the clip people are about to argue over?`, 110),
    search_first: truncate(`${sentenceCase(input.primarySearchTopic)} is the clip topic to watch.`, 110),
  }
}

function rbWomenCommentPrompt(input: {
  debateTopic: string | null
  pillar: RBWomenContentPillar
  featuredPlayer: string | null
}): string {
  if (input.pillar === 'player_personality') return `Did this quote make you like ${input.featuredPlayer ?? 'the player'} more?`
  if (input.debateTopic === 'officiating/fairness') return 'Was this fair, or did the whistle change how the moment landed?'
  if (input.debateTopic === 'credit distribution') return 'Who deserves the credit on this play?'
  if (input.debateTopic === 'popularity versus production') return 'Are fans rewarding production, popularity, or both?'
  if (input.debateTopic === 'media power/visibility') return 'Is the coverage matching the basketball?'
  if (input.debateTopic) return `Where do you land on this ${input.debateTopic} debate?`
  if (input.pillar === 'elite_basketball') return 'Is the play itself enough, or does the story make it better?'
  if (input.pillar === 'college_basketball') return 'Is this the college hoops story people should be talking about?'
  return 'Is this the kind of women\'s sports story that deserves more attention?'
}

function genericRbWomenStory(text: string): boolean {
  return containsAny(text, RB_WOMEN_GENERIC_NEWS_TERMS)
}

function rbWomenCaption(input: {
  pillar: RBWomenContentPillar
  featuredPlayer: string | null
  featuredPlayers: string[]
  debateTopic: string | null
  primarySearchTopic: string
  rbAngle: RBWomenEditorialAngle
}): string {
  const subject = input.featuredPlayers.length >= 2
    ? `${input.featuredPlayers[0]} and ${input.featuredPlayers[1]}`
    : input.featuredPlayer
  if (input.rbAngle === 'credit distribution') {
    return truncate(`${subject ?? 'This play'} is really about who gets credit when the assist creates the moment.`, 180)
  }
  if (input.rbAngle === 'basketball evidence' && input.primarySearchTopic.toLowerCase().includes('production')) {
    return truncate(`${subject ?? 'This player'} put production on the table, so the basketball has to lead the conversation.`, 180)
  }
  if (input.rbAngle === 'popularity versus production') {
    return truncate(`${subject ?? 'This player'} put production on the table, so the star-system conversation has to deal with the basketball.`, 180)
  }
  if (input.rbAngle === 'unequal visibility' || input.rbAngle === 'media power') {
    return truncate(`${subject ?? 'This moment'} is a basketball case for why the coverage should be harder to ignore.`, 180)
  }
  if (input.pillar === 'debate') {
    return truncate(`${subject ?? 'This WNBA moment'} made the ${input.debateTopic ?? 'debate'} feel immediate.`, 180)
  }
  if (input.pillar === 'player_personality') {
    return truncate(`${subject ?? 'This player'} gave fans the quote they were already going to replay.`, 180)
  }
  if (input.pillar === 'elite_basketball') {
    return truncate(`${subject ?? 'This matchup'} turned the basketball into the whole story.`, 180)
  }
  if (input.pillar === 'college_basketball') {
    return truncate(`${subject ?? 'Women\'s college basketball'} has the kind of moment fans will actually discuss.`, 180)
  }
  return truncate(`${subject ?? sentenceCase(input.primarySearchTopic)} made the bigger women\'s sports conversation feel specific.`, 180)
}

function rbWomenHashtags(input: RBHQIntelligenceInput, text: string, featuredPlayers: string[], pillar: RBWomenContentPillar, debateTopic: string | null): string[] {
  const playerTags = featuredPlayers.map((player) => `#${player.replace(/[^A-Za-z0-9]/g, '')}`)
  const topicTag = rbWomenTopicHashtag(pillar, debateTopic, text)
  return uniqueHashtags([
    ...playerTags,
    ...rbWomenTeamOrLeagueTags(input, text),
    topicTag ?? '',
    '#RunnitBackWomen',
  ]).filter((tag) => !['#fyp', '#viral', '#trending'].includes(tag.toLowerCase())).slice(0, 5)
}

function rbWomenAngleHashtag(angle: RBWomenEditorialAngle): string {
  if (angle === 'credit distribution') return '#BasketballIQ'
  if (angle === 'popularity versus production') return '#WNBADebate'
  if (angle === 'media power' || angle === 'unequal visibility') return '#WomenSports'
  if (angle === 'basketball evidence') return '#BasketballHighlights'
  return '#RunnitBackWomen'
}

function buildRBWomenIntelligenceV1(input: RBHQIntelligenceInput, analyzer: TikTokAnalyzerOutput | null): RBHQIntelligenceV1 {
  const text = textForSignals(input)
  const titleText = rbWomenTitleSignalText(input)
  const titleProductionSignal = rbWomenProductionSignal(titleText)
  const titleCreditSignal = containsAny(titleText, ['assist', 'assists', 'credit distribution', 'who gets credit'])
  const hook = buildHook(input, analyzer)
  const { featuredPlayers, titlePlayers } = rbWomenPlayersFromInput(input)
  const featuredPlayer = featuredPlayers[0] ?? rbWomenFeaturedPlayer(text)
  const outputFeaturedPlayers = titleProductionSignal && !titleCreditSignal && titlePlayers.length > 0
    ? titlePlayers
    : featuredPlayers
  const outputFeaturedPlayer = outputFeaturedPlayers[0] ?? featuredPlayer
  const rawDebateTopic = rbWomenDebateTopic(text)
  const debateTopic = titleProductionSignal && !titleCreditSignal && rawDebateTopic === 'credit distribution'
    ? null
    : rawDebateTopic
  const pillar = rbWomenPillar(input, text, featuredPlayer, debateTopic)
  const primarySearchTopic = rbWomenPrimarySearchTopic(input, outputFeaturedPlayers, debateTopic, pillar, text)
  const rawRbAngle = rbWomenEditorialAngle(text, pillar)
  const rbAngle = titleProductionSignal && !titleCreditSignal && rawRbAngle === 'credit distribution'
    ? 'basketball evidence'
    : rawRbAngle
  const genericLeagueNews = containsAny(text, RB_WOMEN_GENERIC_NEWS_TERMS)
  const requiresLongExplanation = containsAny(text, RB_WOMEN_CONTEXT_HEAVY_TERMS)
  const weakFirstTwoSeconds = hook.length < 30 || containsAny(hook.toLowerCase(), ['announced', 'schedule', 'rule might', 'explained'])
  const noRecognizablePerson = !rbWomenHumanAngle(text, featuredPlayer)
  const missingFootageOrQuote = !rbWomenHasClearFootageOrQuote(text)
  const outsideUsefulSegment = !rbWomenHasUsefulSegment(input)
  const hours = recencyHours(input)
  const outsideScoutWindow = isYouTubeRssSource(input) && hours !== null && hours > 72
  const recycledArgument = containsAny(text, ['recycled argument', 'same debate', 'without new footage', 'old footage'])
  const staticTalkingWithoutStrongQuote =
    containsAny(text, RB_WOMEN_STATIC_TALK_TERMS) &&
    !containsAny(text, ['quote', 'said', 'did not hold back', 'joked', 'called out', 'responds'])

  const positive = {
    recognizableAthlete: featuredPlayer ? 20 : 0,
    clearConflictOrDebate: debateTopic || containsAny(text, RB_WOMEN_CONFLICT_TERMS) ? 20 : 0,
    strongQuote: rbWomenStrongQuote(text) ? 15 : 0,
    veteranVersusRookieContext: debateTopic === 'veteran-versus-rookie' ? 10 : 0,
    rbAngleFit: rbAngle !== 'basketball evidence' ? 15 : 0,
    basketballEvidence: rbWomenProductionSignal(text) || containsAny(text, ['assist', 'assists', 'bucket', 'rebound']) ? 15 : 0,
    officiatingFairnessMediaNarrative: debateTopic === 'officiating/fairness' || containsAny(text, ['media narrative', 'media coverage', 'coverage gap']) ? 10 : 0,
    strongVisual: containsAny(text, RB_WOMEN_VISUAL_TERMS) ? 15 : pillar === 'player_personality' && featuredPlayer ? 10 : 0,
    understandableWithoutContext: requiresLongExplanation ? 0 : 15,
    commentPotential: containsAny(text, RB_WOMEN_COMMENT_TERMS) ? 10 : 0,
    emotionalCulturalRelevance: containsAny(text, RB_WOMEN_EMOTIONAL_CULTURE_TERMS) ? 10 : 0,
    searchRelevance: containsAny(text, ['wnba', 'basketball', 'nwsl', 'soccer']) || Boolean(featuredPlayer) ? 5 : 0,
    timeliness: (hours ?? 0) <= 72 ? 5 : 0,
  }
  const penalties = {
    genericLeagueNews: genericLeagueNews ? -15 : 0,
    requiresLongExplanation: requiresLongExplanation ? -15 : 0,
    weakFirstTwoSeconds: weakFirstTwoSeconds ? -20 : 0,
    noRecognizablePerson: noRecognizablePerson ? -10 : 0,
    missingFootageOrQuote: missingFootageOrQuote ? -20 : 0,
    outsideUsefulSegment: outsideUsefulSegment ? -15 : 0,
    outsideScoutWindow: outsideScoutWindow ? -15 : 0,
    recycledArgumentWithoutNewFootage: recycledArgument ? -10 : 0,
    staticTalkingWithoutStrongQuote: staticTalkingWithoutStrongQuote ? -10 : 0,
  }
  const summedScore = Object.values(positive).reduce((total, value) => total + value, 0) +
    Object.values(penalties).reduce((total, value) => total + value, 0)
  const rawScore = requiresLongExplanation && featuredPlayer && debateTopic ? Math.max(summedScore, 55) : summedScore
  const expansionScoreCap = pillar === 'women_sports_expansion' && !containsAny(text, ['wnba']) && !positive.basketballEvidence ? 79 : 100
  const score = clampScore(Math.min(requiresLongExplanation ? Math.min(rawScore, 64) : rawScore, expansionScoreCap))
  const decisionBand = rbWomenDecisionBand(score)
  const scoutLabel = rbWomenScoutLabel(decisionBand)
  const rankLabel = rbWomenRankForBand(decisionBand, score)
  const urgency = rbWomenUrgencyForBand(decisionBand)
  const hooks = rbWomenHooks({ hook, title: input.title ?? '', featuredPlayer: outputFeaturedPlayer, featuredPlayers: outputFeaturedPlayers, debateTopic, primarySearchTopic, pillar })
  const hookType: RBWomenHookType = pillar === 'debate' ? 'debate' : pillar === 'player_personality' ? 'reaction' : 'search_first'
  const expectedEngagementType = rbWomenExpectedEngagementType(pillar, debateTopic, text)
  const pillarLabel = pillar.replace(/_/g, ' ')
  const topicLabel = debateTopic ?? signalSummary(input)
  const reasons = [
    positive.recognizableAthlete ? `RB Women positive: recognizable athlete (${featuredPlayer}).` : null,
    positive.clearConflictOrDebate ? `RB Women positive: conflict/debate angle (${topicLabel}).` : null,
    positive.strongQuote ? 'RB Women positive: strong quote or clear player voice.' : null,
    positive.veteranVersusRookieContext ? 'RB Women positive: veteran-versus-rookie context.' : null,
    positive.rbAngleFit ? `RB Women positive: ${rbAngle} angle.` : null,
    positive.basketballEvidence ? 'RB Women positive: basketball evidence is clear.' : null,
    positive.officiatingFairnessMediaNarrative ? 'RB Women positive: officiating, fairness, or media narrative angle.' : null,
    positive.strongVisual ? 'RB Women positive: strong visual or personality moment.' : null,
    genericLeagueNews ? 'RB Women penalty: generic league news.' : null,
    requiresLongExplanation ? 'RB Women penalty: requires long explanation.' : null,
    weakFirstTwoSeconds ? 'RB Women penalty: weak first two seconds.' : null,
    noRecognizablePerson ? 'RB Women penalty: no recognizable person.' : null,
    missingFootageOrQuote ? 'RB Women penalty: missing clear footage or quote.' : null,
    outsideUsefulSegment ? 'RB Women penalty: segment is outside the useful 10-45 second range.' : null,
    outsideScoutWindow ? 'RB Women penalty: outside the 72-hour scouting window.' : null,
    recycledArgument ? 'RB Women penalty: recycled argument without new footage.' : null,
    staticTalkingWithoutStrongQuote ? 'RB Women penalty: static talking clip without a strong quote.' : null,
    positive.understandableWithoutContext ? 'RB Women positive: understandable without outside context.' : null,
    positive.commentPotential ? 'RB Women positive: comment potential is clear.' : null,
    positive.emotionalCulturalRelevance ? 'RB Women positive: emotional/cultural relevance is present.' : null,
  ].filter((reason): reason is string => Boolean(reason)).slice(0, MAX_REASON_COUNT)
  const commentPrompt = rbWomenCommentPrompt({ debateTopic, pillar, featuredPlayer: outputFeaturedPlayer })
  const suggestedCaption = rbWomenCaption({ pillar, featuredPlayer: outputFeaturedPlayer, featuredPlayers: outputFeaturedPlayers, debateTopic, primarySearchTopic, rbAngle })
  const suggestedHashtags = uniqueHashtags([
    ...rbWomenHashtags(input, text, outputFeaturedPlayers, pillar, debateTopic),
    rbWomenAngleHashtag(rbAngle),
  ]).slice(0, 5)
  const whyNow = scoutLabel === 'post_now'
    ? truncate(`Post now: ${primarySearchTopic} has ${topicLabel} plus ${rbAngle} inside the 72-hour RB Women scouting window.`, 180)
    : truncate(`${scoutLabel === 'develop' ? 'Develop' : 'Hold'}: ${primarySearchTopic} needs operator judgment on ${topicLabel} and ${rbAngle} before it becomes post-now.`, 180)

  return {
    score,
    rankLabel,
    urgency,
    reasons,
    suggestedCaption,
    suggestedHashtags,
    hook: hooks[hookType],
    operatorSummary: truncate(`RB Women ${scoutLabel.replace(/_/g, ' ')}: ${score}/100 on ${primarySearchTopic}. Lead with the basketball, frame the ${rbAngle} without forcing a race-only read.`, 180),
    whyNow,
    rbWomen: {
      model: 'rb_women_content_intelligence_v1',
      channelKey: 'rb_women',
      tiktokHandle: '@runnitbackwomen',
      contentPillar: pillar,
      hookType,
      hooks,
      featuredPlayer: outputFeaturedPlayer,
      featuredPlayers: outputFeaturedPlayers,
      debateTopic,
      rbAngle,
      scoutLabel,
      scoutingWindowHours: 72,
      primarySearchTopic,
      clipDurationSeconds: input.duration_seconds ?? null,
      expectedEngagementType,
      decisionBand,
      scoring: {
        positive,
        penalties,
        rawScore,
      },
      suggestedPinnedComment: commentPrompt,
      recommendedCommentPrompt: commentPrompt,
    },
  }
}

const RB_SPORTS_PLAYER_NAMES = [
  'lebron',
  'lebron james',
  'luka doncic',
  'stephen curry',
  'nikola jokic',
  'giannis antetokounmpo',
  'jayson tatum',
  'anthony edwards',
  'patrick mahomes',
  'travis kelce',
  'lamar jackson',
  'josh allen',
  'dak prescott',
  'micah parsons',
  'shohei ohtani',
  'aaron judge',
  'connor mcdavid',
  'sidney crosby',
  'caitlin clark',
  'roman henry',
  'marquice pless',
]

const RB_SPORTS_TEAM_NAMES = [
  'lakers',
  'los angeles lakers',
  'warriors',
  'golden state warriors',
  'celtics',
  'boston celtics',
  'chiefs',
  'kansas city chiefs',
  'cowboys',
  'dallas cowboys',
  'eagles',
  'philadelphia eagles',
  'yankees',
  'dodgers',
  'maple leafs',
  'oilers',
  'mokan elite',
  'az unity',
]

const RB_SPORTS_COACH_NAMES = [
  'andy reid',
  'steve kerr',
  'jj redick',
  'mike mccarthy',
  'nick sirianni',
  'doc rivers',
]

const RB_SPORTS_LEAGUE_NAMES = ['nba', 'nfl', 'mlb', 'nhl']

const RB_SPORTS_DISPLAY_NAMES: Record<string, string> = {
  lebron: 'LeBron James',
  'lebron james': 'LeBron James',
  'luka doncic': 'Luka Doncic',
  'stephen curry': 'Stephen Curry',
  'nikola jokic': 'Nikola Jokic',
  'giannis antetokounmpo': 'Giannis Antetokounmpo',
  'jayson tatum': 'Jayson Tatum',
  'anthony edwards': 'Anthony Edwards',
  'patrick mahomes': 'Patrick Mahomes',
  'travis kelce': 'Travis Kelce',
  'lamar jackson': 'Lamar Jackson',
  'josh allen': 'Josh Allen',
  'dak prescott': 'Dak Prescott',
  'micah parsons': 'Micah Parsons',
  'shohei ohtani': 'Shohei Ohtani',
  'aaron judge': 'Aaron Judge',
  'connor mcdavid': 'Connor McDavid',
  'sidney crosby': 'Sidney Crosby',
  'caitlin clark': 'Caitlin Clark',
  'roman henry': 'Roman Henry',
  'marquice pless': 'Marquice Pless',
  'lakers': 'Lakers',
  'los angeles lakers': 'Los Angeles Lakers',
  'warriors': 'Warriors',
  'golden state warriors': 'Golden State Warriors',
  'celtics': 'Celtics',
  'boston celtics': 'Boston Celtics',
  'chiefs': 'Chiefs',
  'kansas city chiefs': 'Kansas City Chiefs',
  'cowboys': 'Cowboys',
  'dallas cowboys': 'Dallas Cowboys',
  'eagles': 'Eagles',
  'philadelphia eagles': 'Philadelphia Eagles',
  'yankees': 'Yankees',
  'dodgers': 'Dodgers',
  'maple leafs': 'Maple Leafs',
  'oilers': 'Oilers',
  'mokan elite': 'MOKAN Elite',
  'az unity': 'AZ Unity',
  'andy reid': 'Andy Reid',
  'steve kerr': 'Steve Kerr',
  'jj redick': 'JJ Redick',
  'mike mccarthy': 'Mike McCarthy',
  'nick sirianni': 'Nick Sirianni',
  'doc rivers': 'Doc Rivers',
  nba: 'NBA',
  nfl: 'NFL',
  mlb: 'MLB',
  nhl: 'NHL',
}

const RB_SPORTS_BREAKING_TERMS = ['breaking', 'just in', 'report', 'reports', 'reported', 'sources', 'confirmed']
const RB_SPORTS_CLUTCH_TERMS = ['clutch', 'game winner', 'game-winner', 'buzzer beater', 'walk-off', 'walkoff', 'overtime', 'final play', 'late winner']
const RB_SPORTS_OFFICIATING_TERMS = ['bad call', 'controversial call', 'officiating', 'ref', 'refs', 'flag', 'whistle', 'ejected', 'ejection']
const RB_SPORTS_RIVALRY_TERMS = ['rivalry', 'rival', 'heated', 'trash talk', 'beef', 'calls out', 'called out']
const RB_SPORTS_TRADE_TERMS = ['trade', 'traded', 'roster', 'free agency', 'signs', 'signed', 'waived', 'released', 'extension']
const RB_SPORTS_INJURY_TERMS = ['injury', 'injured', 'return', 'returns', 'ruled out', 'questionable', 'cleared', 'back in']
const RB_SPORTS_PLAYOFF_TERMS = ['playoff', 'playoffs', 'finals', 'championship', 'elimination', 'series', 'title']
const RB_SPORTS_STAR_PERFORMANCE_TERMS = ['star', 'explodes', 'drops', 'goes off', 'career-high', 'career high', 'dominates', 'triple-double', 'touchdowns', 'home runs']
const RB_SPORTS_UPSET_TERMS = ['upset', 'stunner', 'collapse', 'loss reaction', 'stunned', 'shocked']
const RB_SPORTS_QUOTE_TERMS = ['quote', 'said', 'press conference', 'presser', 'responds', 'reaction', 'reacts', 'coach', 'player']
const RB_SPORTS_FAN_DEBATE_TERMS = ['fans split', 'fan debate', 'debate', 'argue', 'internet reacts', 'timeline', 'viral']
const RB_SPORTS_NOISE_TERMS = [
  'betting',
  'sportsbook',
  'odds',
  'parlay',
  'prop bet',
  'props',
  'fantasy',
  'waiver',
  'start/sit',
  'start sit',
  'power rankings',
  'ranking',
  'rankings',
  'schedule',
  'ticket',
  'tickets',
  'merch',
  'sponsor',
  'sponsored',
  'full episode',
  'podcast',
  'livestream',
  'live stream',
  'evergreen debate',
  'top 10',
  'best plays',
  'highlight dump',
  'compilation',
]

const RB_SPORTS_RB_WOMEN_SPILLOVER_TERMS = [
  'wnba',
  'women’s basketball',
  'womens basketball',
  'women basketball',
  'caitlin clark',
  'paige bueckers',
  'angel reese',
  'aja wilson',
  'a’ja wilson',
]

const RB_SPORTS_PROPER_NAME_STOP_WORDS = new Set([
  'career high',
  'historic night',
  'fastest player',
  'full game',
  'full highlights',
  'game highlights',
  'final possession',
  'second night',
  'back to',
  'new career',
  'player to',
  'sports center',
])

function rbSportsDisplayName(value: string): string {
  return RB_SPORTS_DISPLAY_NAMES[value] ?? value.split(' ').map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ')
}

function rbSportsMatches(text: string, values: string[]): string[] {
  const matches: string[] = []
  for (const value of values) {
    if (!text.includes(value)) continue
    const displayName = rbSportsDisplayName(value)
    if (!matches.includes(displayName)) matches.push(displayName)
  }
  return matches
}

function rbSportsTitleProperNameCandidates(input: RBHQIntelligenceInput): string[] {
  const raw = [
    input.title,
    input.source_title,
    input.hook,
  ].map(compact).join(' ')
  if (!raw) return []

  const candidates: string[] = []
  const patterns = [
    /\b[A-Z][a-zA-Z'’.-]{2,}\s+[A-Z][a-zA-Z'’.-]{2,}\b/g,
    /\b[A-Z][A-Z'’.-]{2,}\s+[A-Z][A-Z'’.-]{2,}\b/g,
  ]
  for (const pattern of patterns) {
    for (const match of raw.matchAll(pattern)) {
      const value = compact(match[0].replace(/[|,:;!?()[\]{}]/g, ' '))
      const lower = value.toLowerCase()
      if (!value || RB_SPORTS_PROPER_NAME_STOP_WORDS.has(lower)) continue
      if (RB_SPORTS_LEAGUE_NAMES.includes(lower)) continue
      if (RB_SPORTS_TEAM_NAMES.includes(lower)) continue
      if (RB_SPORTS_COACH_NAMES.includes(lower)) continue
      if (containsAny(lower, ['career', 'historic', 'fastest', 'player', 'full', 'night'])) continue
      const displayName = rbSportsDisplayName(lower)
      if (!candidates.includes(displayName)) candidates.push(displayName)
    }
  }
  return candidates
}

function rbSportsTitleSignalText(input: RBHQIntelligenceInput): string {
  return [
    input.title,
    input.source_title,
    input.hook,
    input.recommended_hook,
  ].map(compact).join(' ').toLowerCase()
}

function rbSportsEntitiesFromInput(input: RBHQIntelligenceInput): {
  playerEntity: string | null
  teamEntity: string | null
  coachEntity: string | null
  leagueEntity: string | null
  entityType: RBSportsIntelligenceMetadata['entityType']
} {
  const titleText = rbSportsTitleSignalText(input)
  const allText = textForSignals(input)
  const players = [
    ...rbSportsMatches(titleText, RB_SPORTS_PLAYER_NAMES),
    ...rbSportsMatches(allText, RB_SPORTS_PLAYER_NAMES),
    ...rbSportsTitleProperNameCandidates(input),
  ]
  const teams = [...rbSportsMatches(titleText, RB_SPORTS_TEAM_NAMES), ...rbSportsMatches(allText, RB_SPORTS_TEAM_NAMES)]
  const coaches = [...rbSportsMatches(titleText, RB_SPORTS_COACH_NAMES), ...rbSportsMatches(allText, RB_SPORTS_COACH_NAMES)]
  const leagues = [
    ...rbSportsMatches(titleText, RB_SPORTS_LEAGUE_NAMES),
    ...rbSportsMatches(allText, RB_SPORTS_LEAGUE_NAMES),
    compact(input.league).toUpperCase(),
  ].filter(Boolean)
  const unique = (values: string[]) => [...new Set(values)]
  const playerEntity = unique(players)[0] ?? null
  const teamEntity = unique(teams)[0] ?? null
  const coachEntity = unique(coaches)[0] ?? null
  const leagueEntity = unique(leagues)[0] ?? null
  const lower = allText
  const entityType: RBSportsIntelligenceMetadata['entityType'] =
    playerEntity ? 'player' :
      teamEntity ? 'team' :
        coachEntity ? 'coach' :
          containsAny(lower, RB_SPORTS_TRADE_TERMS) ? 'transaction' :
            containsAny(lower, RB_SPORTS_INJURY_TERMS) ? 'injury' :
              leagueEntity ? 'league' : 'unknown'
  return { playerEntity, teamEntity, coachEntity, leagueEntity, entityType }
}

function rbSportsAngle(text: string): RBSportsEditorialAngle {
  if (containsAny(text, RB_SPORTS_OFFICIATING_TERMS)) return 'bad call / officiating heat'
  if (containsAny(text, RB_SPORTS_TRADE_TERMS)) return 'trade / roster movement'
  if (containsAny(text, RB_SPORTS_INJURY_TERMS)) return 'injury / return'
  if (containsAny(text, RB_SPORTS_CLUTCH_TERMS)) return 'clutch proof'
  if (containsAny(text, RB_SPORTS_PLAYOFF_TERMS)) return 'playoff stakes'
  if (containsAny(text, RB_SPORTS_RIVALRY_TERMS)) return 'rivalry heat'
  if (containsAny(text, RB_SPORTS_STAR_PERFORMANCE_TERMS) || /\b\d{2}[-\s]*(pt|pts|points|reb|rebs|ast|td|touchdowns|hr|home runs)\b/.test(text)) return 'star performance'
  if (containsAny(text, RB_SPORTS_UPSET_TERMS)) return 'upset reaction'
  if (containsAny(text, RB_SPORTS_QUOTE_TERMS)) return 'coach/player quote'
  if (containsAny(text, RB_SPORTS_FAN_DEBATE_TERMS)) return 'fan debate'
  if (containsAny(text, RB_SPORTS_BREAKING_TERMS)) return 'breaking reaction'
  return 'highlight evidence'
}

function rbSportsIsRBWomenSpillover(input: RBHQIntelligenceInput, text: string): boolean {
  const league = compact(input.league).toLowerCase()
  return league === 'wnba' || containsAny(text, RB_SPORTS_RB_WOMEN_SPILLOVER_TERMS)
}

function rbSportsTopicForAngle(angle: RBSportsEditorialAngle, entities: ReturnType<typeof rbSportsEntitiesFromInput>, input: RBHQIntelligenceInput): string {
  const subject = entities.playerEntity ?? entities.teamEntity ?? entities.coachEntity ?? entities.leagueEntity ?? compact(input.league || input.sport || 'RB Sports')
  if (angle === 'trade / roster movement') return `${subject} roster movement`
  if (angle === 'injury / return') return `${subject} injury return`
  if (angle === 'bad call / officiating heat') return `${subject} officiating debate`
  if (angle === 'clutch proof') return `${subject} clutch moment`
  if (angle === 'playoff stakes') return `${subject} playoff stakes`
  if (angle === 'star performance') return `${subject} star performance`
  if (angle === 'upset reaction') return `${subject} upset reaction`
  if (angle === 'coach/player quote') return `${subject} quote reaction`
  if (angle === 'rivalry heat') return `${subject} rivalry heat`
  if (angle === 'fan debate') return `${subject} fan debate`
  if (angle === 'breaking reaction') return `${subject} breaking reaction`
  return `${subject} highlight evidence`
}

function rbSportsDecisionBand(score: number): RBSportsDecisionBand {
  if (score >= 82) return 'high_confidence'
  if (score >= 66) return 'operator_review'
  if (score >= 50) return 'hold_unless_timely'
  return 'reject'
}

function rbSportsScoutLabel(decisionBand: RBSportsDecisionBand): RBSportsScoutLabel {
  if (decisionBand === 'high_confidence') return 'post_now'
  if (decisionBand === 'operator_review') return 'develop'
  return 'hold'
}

function rbSportsRankForBand(band: RBSportsDecisionBand, score: number): RBHQIntelligenceRankLabel {
  if (band === 'high_confidence') return 'must_post'
  if (band === 'operator_review') return score >= 76 ? 'strong' : 'solid'
  return 'low_priority'
}

function rbSportsUrgencyForBand(band: RBSportsDecisionBand): RBHQIntelligenceUrgency {
  if (band === 'high_confidence') return 'post_now'
  if (band === 'operator_review') return 'today'
  return 'hold'
}

function rbSportsCaption(input: {
  subject: string
  angle: RBSportsEditorialAngle
}): string {
  if (input.angle === 'bad call / officiating heat') return truncate(`${input.subject} has the call everyone is going to argue about.`, 180)
  if (input.angle === 'clutch proof') return truncate(`${input.subject} gave the timeline the late-game proof, not just another highlight.`, 180)
  if (input.angle === 'trade / roster movement') return truncate(`${input.subject} changes the roster conversation right now.`, 180)
  if (input.angle === 'injury / return') return truncate(`${input.subject} matters because the availability story changes the matchup.`, 180)
  if (input.angle === 'playoff stakes') return truncate(`${input.subject} turned the stakes into the whole clip.`, 180)
  if (input.angle === 'star performance') return truncate(`${input.subject} put the performance on tape, so lead with the evidence.`, 180)
  if (input.angle === 'upset reaction') return truncate(`${input.subject} is the loss reaction people are about to replay.`, 180)
  if (input.angle === 'coach/player quote') return truncate(`${input.subject} gave the quote that makes this more than a recap.`, 180)
  if (input.angle === 'rivalry heat') return truncate(`${input.subject} made the rivalry feel current again.`, 180)
  if (input.angle === 'fan debate') return truncate(`${input.subject} is the clip built for the comments.`, 180)
  if (input.angle === 'breaking reaction') return truncate(`${input.subject} is moving fast enough to post while the reaction is still live.`, 180)
  return truncate(`${input.subject} has enough sports evidence to test today.`, 180)
}

function rbSportsHashtags(input: RBHQIntelligenceInput, entities: ReturnType<typeof rbSportsEntitiesFromInput>, angle: RBSportsEditorialAngle): string[] {
  const angleTags: Record<RBSportsEditorialAngle, string> = {
    'breaking reaction': '#Breaking',
    'clutch proof': '#Clutch',
    'bad call / officiating heat': '#BadCall',
    'rivalry heat': '#Rivalry',
    'trade / roster movement': '#TradeTalk',
    'injury / return': '#InjuryUpdate',
    'playoff stakes': '#Playoffs',
    'star performance': '#Highlights',
    'upset reaction': '#Upset',
    'coach/player quote': '#PressConference',
    'fan debate': '#FanDebate',
    'highlight evidence': '#Highlights',
  }
  return uniqueHashtags([
    entities.leagueEntity ? `#${entities.leagueEntity}` : '',
    entities.teamEntity ? `#${entities.teamEntity}` : '',
    entities.playerEntity ? `#${entities.playerEntity}` : '',
    input.league ? `#${input.league}` : '',
    angleTags[angle],
    '#RBSports',
    '#RunnitBack',
  ]).slice(0, 5)
}

function buildRBSportsIntelligenceV1(input: RBHQIntelligenceInput, analyzer: TikTokAnalyzerOutput | null): RBHQIntelligenceV1 {
  const text = textForSignals(input)
  const hook = buildHook(input, analyzer)
  const entities = rbSportsEntitiesFromInput(input)
  const angle = rbSportsAngle(text)
  const primarySearchTopic = rbSportsTopicForAngle(angle, entities, input)
  const subject = entities.playerEntity ?? entities.teamEntity ?? entities.coachEntity ?? entities.leagueEntity ?? sentenceCase(primarySearchTopic)
  const hours = recencyHours(input)
  const outsideScoutWindow = isYouTubeRssSource(input) && hours !== null && hours > 48
  const insideBreakingWindow = hours === null || hours <= 6
  const rbWomenSpillover = rbSportsIsRBWomenSpillover(input, text)
  const noiseOnly = containsAny(text, RB_SPORTS_NOISE_TERMS) && !containsAny(text, [
    ...RB_SPORTS_BREAKING_TERMS,
    ...RB_SPORTS_CLUTCH_TERMS,
    ...RB_SPORTS_OFFICIATING_TERMS,
    ...RB_SPORTS_TRADE_TERMS,
    ...RB_SPORTS_INJURY_TERMS,
    ...RB_SPORTS_PLAYOFF_TERMS,
  ])
  const hasEntity = Boolean(entities.playerEntity || entities.teamEntity || entities.coachEntity || entities.leagueEntity || entities.entityType === 'transaction' || entities.entityType === 'injury')
  const hasCurrentSignal = angle !== 'highlight evidence' || containsAny(text, ['highlight', 'reaction', 'fans', 'game'])
  const usefulSegment = typeof input.duration_seconds !== 'number' || (input.duration_seconds >= 10 && input.duration_seconds <= 45)
  const positive = {
    recognizableEntity: hasEntity ? 18 : 0,
    breakingWindow: insideBreakingWindow && containsAny(text, RB_SPORTS_BREAKING_TERMS) ? 14 : 0,
    clutchOrBadCall: angle === 'clutch proof' || angle === 'bad call / officiating heat' ? 20 : 0,
    tradeInjuryRoster: angle === 'trade / roster movement' || angle === 'injury / return' ? 18 : 0,
    rivalryPlayoffUpset: ['rivalry heat', 'playoff stakes', 'upset reaction'].includes(angle) ? 15 : 0,
    starPerformance: angle === 'star performance' ? 14 : 0,
    quoteOrFanDebate: angle === 'coach/player quote' || angle === 'fan debate' ? 12 : 0,
    sourceAuthority: sourceAuthoritySignal(input) ? 6 : 0,
    usefulSegment: usefulSegment ? 8 : 0,
    fanReadable: hook.length >= 18 ? 6 : 0,
    freshness: hours === null ? 4 : hours <= 6 ? 12 : hours <= 24 ? 8 : hours <= 48 ? 4 : 0,
  }
  const penalties = {
    rbWomenSpillover: rbWomenSpillover ? -45 : 0,
    noiseOnly: noiseOnly ? -35 : 0,
    outsideScoutWindow: outsideScoutWindow ? -18 : 0,
    noRecognizableEntity: hasEntity ? 0 : -12,
    weakCurrentSignal: hasCurrentSignal ? 0 : -12,
    outsideUsefulSegment: usefulSegment ? 0 : -15,
  }
  const rawScore = 20 +
    Object.values(positive).reduce((total, value) => total + value, 0) +
    Object.values(penalties).reduce((total, value) => total + value, 0)
  const cappedScore = rbWomenSpillover
    ? Math.min(rawScore, 48)
    : noiseOnly
      ? Math.min(rawScore, 48)
      : outsideScoutWindow
        ? Math.min(rawScore, 62)
        : rawScore
  const score = clampScore(cappedScore)
  const decisionBand = rbSportsDecisionBand(score)
  const scoutLabel = rbSportsScoutLabel(decisionBand)
  const rankLabel = rbSportsRankForBand(decisionBand, score)
  const urgency = rbSportsUrgencyForBand(decisionBand)
  const reasons = [
    positive.recognizableEntity ? `RB Sports positive: recognizable entity (${subject}).` : null,
    positive.breakingWindow ? 'RB Sports positive: breaking clip inside the 0-6 hour urgency window.' : null,
    positive.clutchOrBadCall ? `RB Sports positive: ${angle} has strong comment potential.` : null,
    positive.tradeInjuryRoster ? `RB Sports positive: ${angle} changes the current sports conversation.` : null,
    positive.rivalryPlayoffUpset ? `RB Sports positive: ${angle} gives the clip stakes.` : null,
    positive.starPerformance ? 'RB Sports positive: star performance evidence is clear.' : null,
    positive.quoteOrFanDebate ? 'RB Sports positive: quote or fan-debate framing is clear.' : null,
    rbWomenSpillover ? 'RB Sports penalty: WNBA or women’s basketball spillover belongs in RB Women Phase 1.' : null,
    noiseOnly ? 'RB Sports penalty: betting, fantasy, rankings, schedule, longform, or low-context filler.' : null,
    outsideScoutWindow ? 'RB Sports penalty: outside the 48-hour scouting window.' : null,
    penalties.noRecognizableEntity ? 'RB Sports penalty: no clear player, team, coach, league, transaction, or injury entity.' : null,
    penalties.weakCurrentSignal ? 'RB Sports penalty: weak current sports-news or highlight signal.' : null,
    penalties.outsideUsefulSegment ? 'RB Sports penalty: segment is outside the useful 10-45 second range.' : null,
  ].filter((reason): reason is string => Boolean(reason)).slice(0, MAX_REASON_COUNT)
  const whyNow = scoutLabel === 'post_now'
    ? truncate(`Post now: ${primarySearchTopic} has ${angle} inside the 48-hour RB Sports scouting window${insideBreakingWindow ? ' with 0-6 hour urgency' : ''}.`, 180)
    : truncate(`${scoutLabel === 'develop' ? 'Develop' : 'Hold'}: ${primarySearchTopic} needs operator review because ${reasons[0]?.replace(/^RB Sports (positive|penalty): /, '') ?? 'the signal is not post-now yet'}.`, 180)

  return {
    score,
    rankLabel,
    urgency,
    reasons,
    suggestedCaption: rbSportsCaption({ subject, angle }),
    suggestedHashtags: rbSportsHashtags(input, entities, angle),
    hook: truncate(`${subject}: ${angle} is the RB Sports angle.`, 110),
    operatorSummary: truncate(`RB Sports ${scoutLabel.replace(/_/g, ' ')}: ${score}/100 on ${primarySearchTopic}. Keep it direct, fan-first, and evidence-led.`, 180),
    whyNow,
    rbSports: {
      model: 'rb_sports_content_intelligence_v1',
      channelKey: 'rb_sports',
      tiktokHandle: '@runnitbacksports',
      rbAngle: angle,
      scoutLabel,
      scoutingWindowHours: 48,
      breakingWindowHours: 6,
      primarySearchTopic,
      clipTopic: primarySearchTopic,
      playerEntity: entities.playerEntity,
      teamEntity: entities.teamEntity,
      coachEntity: entities.coachEntity,
      leagueEntity: entities.leagueEntity,
      entityType: entities.entityType,
      decisionBand,
      scoring: { positive, penalties, rawScore },
    },
  }
}

function detectedPatternSignals(text: string, lane: string): ViralSignalCategory[] {
  return VIRAL_SIGNAL_CATEGORIES.filter((category) => {
    if (category.lanes && !category.lanes.includes(lane)) return false
    return countPatternHits(text, category.patterns) > 0
  })
}

function sourceAuthoritySignal(input: RBHQIntelligenceInput): ViralSignalCategory | null {
  const source = compact(`${input.source_name ?? ''} ${input.source_type ?? ''}`).toLowerCase()
  if (!source) return null
  const authorityPatterns = [
    'espn',
    'nba',
    'nfl',
    'wnba',
    'ufc',
    'one championship',
    'pfl',
    'bellator',
    'dazn',
    'valorant champions tour',
    'lol esports',
    'rocket league esports',
    'call of duty league',
    'esl counter-strike',
    'nwsl',
    'ncaa',
    'sec',
    'acc digital network',
    'cfp',
    'major league soccer',
    'mls',
    'fifa',
    'uefa',
    'official',
  ]
  if (authorityPatterns.some((pattern) => source.includes(pattern))) {
    return {
      key: 'source_authority',
      label: 'source authority',
      caption: 'trusted source',
      hashtags: [],
      patterns: [],
      scoreBoost: 3,
      timingWeight: 0,
    }
  }
  return null
}

function freshnessSignal(input: RBHQIntelligenceInput): ViralSignalCategory | null {
  const hours = recencyHours(input)
  if (hours === null || hours > 24) return null
  return {
    key: 'freshness',
    label: hours <= 3 ? 'freshness: 0-3 hour window' : 'freshness: same-day window',
    caption: 'fresh clip',
    hashtags: [],
    patterns: [],
    scoreBoost: hours <= 3 ? 4 : 2,
    timingWeight: hours <= 3 ? 4 : 2,
  }
}

function topicMomentumSignal(text: string): ViralSignalCategory | null {
  const momentumHits = countPatternHits(text, [
    'reports',
    'sources',
    'confirmed',
    'reaction',
    'reacts',
    'fans',
    'crowd',
    'everyone',
    'internet',
    'viral',
    'roundup',
  ])
  if (momentumHits < 2) return null
  return {
    key: 'topic_momentum',
    label: 'topic momentum',
    caption: 'timeline reaction',
    hashtags: ['#Reaction'],
    patterns: [],
    scoreBoost: 3,
    timingWeight: 2,
  }
}

function detectedViralSignals(input: RBHQIntelligenceInput): ViralSignalCategory[] {
  const text = textForSignals(input)
  const signals = [
    ...detectedPatternSignals(text, laneSlug(input)),
    topicMomentumSignal(text),
    sourceAuthoritySignal(input),
    freshnessSignal(input),
  ].filter((signal): signal is ViralSignalCategory => Boolean(signal))

  const seen = new Set<ViralSignalKey>()
  return signals.filter((signal) => {
    if (seen.has(signal.key)) return false
    seen.add(signal.key)
    return true
  })
}

function signalSummary(input: RBHQIntelligenceInput): string {
  const labels = detectedViralSignals(input)
    .filter((signal) => signal.key !== 'source_authority' && signal.key !== 'freshness')
    .map((signal) => signal.label)
  return labels.length > 0 ? labels.slice(0, 2).join(' + ') : 'story'
}

function signalHashtags(text: string, lane: string): string[] {
  return detectedPatternSignals(text, lane)
    .map((signal) => signal.hashtags[0])
    .filter((tag): tag is string => Boolean(tag))
    .slice(0, 2)
}

function postingWindowForInput(input: RBHQIntelligenceInput, urgency: RBHQIntelligenceUrgency): string {
  const hours = recencyHours(input)
  if (urgency === 'post_now') {
    if (hours !== null && hours <= 3) return '0-3 hour viral window'
    if (hours !== null && hours <= 12) return 'same-cycle viral window'
    return 'active conversation window'
  }
  if (urgency === 'today') {
    if (hours !== null && hours <= 24) return 'same-day review window'
    return 'today-only review window'
  }
  if (urgency === 'evergreen') return 'evergreen fill-in window'
  return 'hold window'
}

function laneWindowPhrase(input: RBHQIntelligenceInput, urgency: RBHQIntelligenceUrgency): string {
  const lane = laneSlug(input)
  if (urgency === 'post_now') {
    if (lane === 'arena') return 'before the match, patch, or lobby conversation moves on'
    if (lane === 'combat') return 'before fight fans move to the next faceoff or card'
    if (lane === 'women') return 'while women\'s sports fans are still reacting'
    if (lane === 'futbol') return 'before the match-day futbol conversation resets'
    if (lane === 'runnitbackcfb') return 'before the college football timeline rolls into the next debate'
    return 'before the sports timeline cools'
  }
  if (urgency === 'today') {
    if (lane === 'arena') return 'keep it in today\'s gaming review batch'
    if (lane === 'combat') return 'keep it in today\'s fight review batch'
    if (lane === 'women') return 'keep it in today\'s women\'s sports review batch'
    if (lane === 'futbol') return 'keep it in today\'s futbol review batch'
    if (lane === 'runnitbackcfb') return 'keep it in today\'s college football review batch'
    return 'keep it in today\'s sports review batch'
  }
  return 'use it only after higher-timing clips are handled'
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

function isYouTubeRssSource(input: RBHQIntelligenceInput): boolean {
  return input.source_type === 'youtube_rss'
}

function sourceFreshnessAdjustment(input: RBHQIntelligenceInput): number {
  if (!isYouTubeRssSource(input)) return 0
  const hours = recencyHours(input)
  if (hours === null) return 0
  if (hours > 168) return -10
  if (hours > 72) return -6
  if (hours > 24) return -3
  return 0
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

  return score + sourceFreshnessAdjustment(input)
}

function viralSignalBoost(input: RBHQIntelligenceInput, analyzer: TikTokAnalyzerOutput | null): number {
  const signalBoost = detectedViralSignals(input)
    .reduce((total, signal) => total + signal.scoreBoost, 0)
  const analyzerBoost =
    (hasAnalyzerTag(analyzer, 'breaking') ? 5 : 0) +
    (hasAnalyzerTag(analyzer, 'injury') ? 4 : 0) +
    (hasAnalyzerTag(analyzer, 'rivalry') ? 3 : 0) +
    (hasAnalyzerTag(analyzer, 'controversy') ? 3 : 0) +
    (hasAnalyzerTag(analyzer, 'fan_reaction') ? 2 : 0)

  return Math.min(22, signalBoost + analyzerBoost)
}

function viralTimingWeight(input: RBHQIntelligenceInput, analyzer: TikTokAnalyzerOutput | null): number {
  const signalWeight = detectedViralSignals(input)
    .reduce((total, signal) => total + signal.timingWeight, 0)
  const analyzerWeight =
    (hasAnalyzerTag(analyzer, 'breaking') ? 5 : 0) +
    (hasAnalyzerTag(analyzer, 'injury') ? 5 : 0) +
    (hasAnalyzerTag(analyzer, 'rivalry') ? 3 : 0) +
    (hasAnalyzerTag(analyzer, 'controversy') ? 3 : 0) +
    (hasAnalyzerTag(analyzer, 'fan_reaction') ? 2 : 0)

  return signalWeight + analyzerWeight
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
  const staleSourceCandidate = isYouTubeRssSource(input) && hours !== null && hours > 72
  const timingWeight = viralTimingWeight(input, analyzer)
  const hasFreshness = hours === null || hours <= 24
  const blocked =
    score < 45 ||
    hasAnalyzerTag(analyzer, 'wrong_format') ||
    hasAnalyzerTag(analyzer, 'low_quality') ||
    (input.risk_flags ?? []).some((flag) => /wrong_format|low_quality|blocked/i.test(flag))

  if (blocked) return 'hold'
  if (staleSourceCandidate) return 'evergreen'
  if (timingWeight >= 8 && hasFreshness && (hours === null || hours <= 12 || eventHits >= 3)) {
    return 'post_now'
  }
  if (
    timingWeight > 0 ||
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
  const lane = laneSlug(input)
  const signal = detectedPatternSignals(text, lane)[0]
  const topic = compact([context, signal?.caption].filter(Boolean).join(' '))
  const angle = topic
    ? `${sentenceCase(topic)} is the angle to test`
    : 'Test the strongest moment'
  const laneClose =
    lane === 'arena'
      ? 'before the gaming feed moves on.'
      : lane === 'combat'
        ? 'before fight fans move to the next card.'
        : lane === 'women'
          ? 'before the women\'s sports feed moves on.'
          : lane === 'futbol'
            ? 'before the futbol feed moves on.'
            : lane === 'runnitbackcfb'
              ? 'before the college football feed moves on.'
              : 'before the sports feed moves on.'

  return truncate(`${sentenceLead(hook)} Quick review: ${angle} ${laneClose}`, 180)
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
    combat: ['#CombatSports', '#FightNight', '#RunnitBack'],
  }
  const text = textForSignals(input)

  return uniqueHashtags([
    input.league ? `#${input.league}` : '',
    input.sport ? `#${input.sport}` : '',
    ...signalHashtags(text, laneSlug(input)),
    ...(laneTags[laneSlug(input)] ?? laneTags.sports),
  ])
}

function reasonLines(input: RBHQIntelligenceInput, analyzer: TikTokAnalyzerOutput | null, score: number): string[] {
  const text = textForSignals(input)
  const reasons: string[] = []
  const hours = recencyHours(input)
  const eventHits = countPatternHits(text, EVENT_PATTERNS)
  const emotionalHits = countPatternHits(text, EMOTIONAL_PATTERNS)
  const viralSignals = detectedViralSignals(input)

  const signals = signalSummary(input)

  if (eventHits > 0) reasons.push(`Viral signal is specific: ${signals}.`)
  if (viralSignals.some((signal) => signal.key === 'source_authority')) {
    reasons.push('Source authority is strong enough for operator trust.')
  }
  if (viralSignals.some((signal) => signal.key === 'topic_momentum')) {
    reasons.push('Topic momentum shows repeated reporting or fan reaction language.')
  }
  if (emotionalHits > 0 || hasAnalyzerTag(analyzer, 'controversy') || hasAnalyzerTag(analyzer, 'rivalry')) {
    reasons.push('Emotional or conflict signal should help comments.')
  }
  if (hours !== null && hours <= 24) {
    reasons.push(hours <= 3 ? 'Freshness signal: use the 0-3 hour posting window.' : 'Freshness signal: still inside the same-day window.')
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
    reasons.push('Gaming lane fit is clear for this source.')
  }
  if (score < 58) reasons.push('Score is below the main operator priority band.')

  return reasons.slice(0, MAX_REASON_COUNT)
}

function whyNowForInput(input: RBHQIntelligenceInput, analyzer: TikTokAnalyzerOutput | null, urgency: RBHQIntelligenceUrgency): string {
  if (analyzer?.whyNow && urgency !== 'evergreen') return truncate(analyzer.whyNow, 180)
  const signals = signalSummary(input)
  const hours = recencyHours(input)
  const recency = hours === null ? '' : hours <= 3 ? ' with a fresh upload' : hours <= 24 ? ' with same-day freshness' : ''
  const window = postingWindowForInput(input, urgency)
  if (urgency === 'post_now') return `${laneLabel(input)} has ${signals} momentum${recency}; ${window}, ${laneWindowPhrase(input, urgency)}.`
  if (urgency === 'today') return `${laneLabel(input)} has a ${signals} angle${recency}; ${window}, ${laneWindowPhrase(input, urgency)}.`
  if (urgency === 'hold') return 'Hold until the format, quality, or story signal is stronger.'
  return `${laneLabel(input)} is not in a live viral window; use as evergreen fill-in when higher-urgency clips are thin.`
}

function operatorSummaryForInput(
  input: RBHQIntelligenceInput,
  analyzer: TikTokAnalyzerOutput | null,
  score: number,
  rankLabel: RBHQIntelligenceRankLabel,
): string {
  if (analyzer?.operatorSummary) return truncate(analyzer.operatorSummary, 180)
  const source = compact(input.source_name) || 'source'
  const signal = signalSummary(input)
  const urgency = urgencyForInput(input, analyzer, score)
  return `${laneLabel(input)}: ${source} clip is ${rankLabel.replace(/_/g, ' ')} at ${score}/100 with ${signal}; ${formatUrgency(urgency)} in the ${postingWindowForInput(input, urgency)}.`
}

export function adaptTikTokAnalysisToRBHQIntelligenceV1(
  input: RBHQIntelligenceInput,
  analyzer: TikTokAnalyzerOutput,
): RBHQIntelligenceV1 {
  return buildRBHQIntelligenceV1({ ...input, analyzer })
}

export function buildRBHQIntelligenceV1(input: RBHQIntelligenceInput): RBHQIntelligenceV1 {
  const analyzer = input.analyzer ?? getStoredTikTokAnalysis(input.moderation_notes)
  if (laneSlug(input) === 'women') {
    return buildRBWomenIntelligenceV1(input, analyzer)
  }
  if (input.channel_id === 'a1000000-0000-0000-0000-000000000001') {
    return buildRBSportsIntelligenceV1(input, analyzer)
  }
  const scoreBoost = viralSignalBoost(input, analyzer)
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
  const rbWomen = readRecord(candidate.rbWomen)
  const rbSports = readRecord(candidate.rbSports)

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
    ...(rbWomen ? { rbWomen: rbWomen as RBWomenIntelligenceMetadata } : {}),
    ...(rbSports ? { rbSports: rbSports as RBSportsIntelligenceMetadata } : {}),
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
  const readiness = readPlanObject(
    (input as Record<string, unknown>).package_readiness ??
      (input as Record<string, unknown>).packageReadiness,
  )
  const clipPrep = readPlanObject(readiness?.clipPrep)
  const captionPrep = readPlanObject(clipPrep?.captionPrep ?? clipPrep?.caption_prep)
  const rbWomenScoutLabel = intelligence.rbWomen?.scoutLabel ?? intelligence.rbSports?.scoutLabel ?? (
    intelligence.urgency === 'post_now'
      ? 'post_now'
      : intelligence.urgency === 'hold' || intelligence.rankLabel === 'low_priority'
        ? 'hold'
        : 'develop'
  )
  const packageRenderStatus = {
    packageId: compactPlanString(readiness?.macMiniPackageId) || null,
    clipPrepStatus: compactPlanString(readiness?.clipPrepStatus ?? clipPrep?.status) || null,
    localRenderStatus: compactPlanString(readiness?.localRenderStatus) || null,
    localRenderAttached: readiness?.localRenderAttached === true,
    localAssetPath: compactPlanString(readiness?.localAssetPath) || null,
  }
  const reviewReason = intelligence.urgency !== 'post_now' || intelligence.rankLabel === 'low_priority'
    ? reviewReasonForIntelligence(intelligence)
    : null
  const transcriptTimed = typeof clipPrep?.transcriptTimed === 'boolean'
    ? clipPrep.transcriptTimed
    : typeof readPlanObject(clipPrep?.basis)?.timed_transcript_available === 'boolean'
      ? readPlanObject(clipPrep?.basis)?.timed_transcript_available as boolean
      : null
  const rbWomenPlan = rbWomenPlanFields(input, intelligence)
  const lanePlan = rbSportsPlanFields(input, intelligence, rbWomenPlan)
  const score = intelligence.score > 0
    ? intelligence.score
    : typeof input.ai_score === 'number' && Number.isFinite(input.ai_score)
      ? clampScore(input.ai_score)
      : intelligence.score
  return {
    id: input.id ?? null,
    title: compact(input.title || input.hook) || 'Untitled clip',
    clipTopic: lanePlan.clipTopic,
    playerEntity: lanePlan.playerEntity,
    teamEntity: lanePlan.teamEntity,
    scoutLabel: rbWomenScoutLabel,
    rbAngle: lanePlan.rbAngle,
    channelId: input.channel_id ?? null,
    lane: laneLabel(input),
    sourceName: input.source_name ?? null,
    score,
    rankLabel: intelligence.rankLabel,
    urgency: intelligence.urgency,
    reasons: intelligence.reasons,
    whyNow: lanePlan.whyNow,
    whyThisShouldPostNow: lanePlan.whyNow,
    operatorSummary: lanePlan.operatorSummary,
    suggestedCaption: lanePlan.suggestedCaption,
    captionDraft: lanePlan.suggestedCaption,
    suggestedHashtags: lanePlan.suggestedHashtags,
    hashtagPack: lanePlan.suggestedHashtags,
    packageRenderStatus,
    transcriptSourceStatus: {
      subtitleSource: compactPlanString(captionPrep?.subtitle_source) || null,
      transcriptTimed,
      sourceType: input.source_type ?? null,
      sourceStatus: compactPlanString(readiness?.sourceStatus ?? clipPrep?.status) || (input.source_type ? 'available' : null),
    },
    reviewReason,
    status: input.status ?? null,
    publishStatus: input.publish_status ?? null,
    createdAt: input.created_at ?? null,
  }
}

function isRBWomenPlanClip(clip: DailyContentPlanClip): boolean {
  return clip.channelId === 'a1000000-0000-0000-0000-000000000004' || clip.lane === 'RB Women'
}

function reviewReasonForIntelligence(intelligence: RBHQIntelligenceV1): string {
  return intelligence.reasons.find((reason) => /penalty|hold|reject|needs|missing|outside|weak/i.test(reason)) ??
    intelligence.reasons[0] ??
    intelligence.operatorSummary ??
    'Needs human review before posting.'
}

function isRBSportsPlanClip(clip: DailyContentPlanClip): boolean {
  return clip.channelId === 'a1000000-0000-0000-0000-000000000001' || clip.lane === 'RB Sports'
}

function selectRBWomenScoutCycle(planClips: DailyContentPlanClip[], limit: number): DailyContentPlanClip[] {
  const output: DailyContentPlanClip[] = []
  const postNow = planClips.find((clip) => clip.scoutLabel === 'post_now')
  if (postNow) output.push(postNow)
  const develop = planClips.find((clip) => clip.scoutLabel === 'develop' && !output.some((item) => item.id === clip.id))
  if (develop && output.length < limit) output.push(develop)
  const hold = planClips.find((clip) => clip.scoutLabel === 'hold' && !output.some((item) => item.id === clip.id))
  if (hold && output.length < limit) output.push(hold)
  for (const clip of planClips) {
    if (output.length >= limit) break
    if (output.some((item) => item.id === clip.id)) continue
    output.push(clip)
  }
  return output
}

function selectScoutCycle(planClips: DailyContentPlanClip[], limit: number): DailyContentPlanClip[] {
  const output: DailyContentPlanClip[] = []
  const postNow = planClips.find((clip) => clip.scoutLabel === 'post_now')
  if (postNow) output.push(postNow)
  const develop = planClips.find((clip) => clip.scoutLabel === 'develop' && !output.some((item) => item.id === clip.id))
  if (develop && output.length < limit) output.push(develop)
  const hold = planClips.find((clip) => clip.scoutLabel === 'hold' && !output.some((item) => item.id === clip.id))
  if (hold && output.length < limit) output.push(hold)
  for (const clip of planClips) {
    if (output.length >= limit) break
    if (output.some((item) => item.id === clip.id)) continue
    output.push(clip)
  }
  return output
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
  const packageDelta = Number(right.packageRenderStatus.localRenderAttached) - Number(left.packageRenderStatus.localRenderAttached)
  if (packageDelta !== 0) return packageDelta
  return right.score - left.score
}

function readPlanObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function compactPlanString(value: unknown): string {
  return typeof value === 'string' ? compact(value) : ''
}

function rbWomenTitleSignalText(input: RBHQIntelligenceInput): string {
  return [
    input.title,
    input.source_title,
    input.hook,
    input.recommended_hook,
  ].map(compact).join(' ').toLowerCase()
}

function rbWomenPlanFields(input: RBHQIntelligenceInput, intelligence: RBHQIntelligenceV1): {
  clipTopic: string
  playerEntity: string | null
  rbAngle: string | null
  whyNow: string
  operatorSummary: string
  suggestedCaption: string
  suggestedHashtags: string[]
} {
  if (input.channel_id !== 'a1000000-0000-0000-0000-000000000004' && laneLabel(input) !== 'RB Women') {
    return {
      clipTopic: compact(input.title || input.hook) || 'Untitled clip',
      playerEntity: null,
      rbAngle: null,
      whyNow: intelligence.whyNow,
      operatorSummary: intelligence.operatorSummary,
      suggestedCaption: intelligence.suggestedCaption,
      suggestedHashtags: intelligence.suggestedHashtags,
    }
  }

  const text = textForSignals(input)
  const titleText = rbWomenTitleSignalText(input)
  const { featuredPlayers, titlePlayers } = rbWomenPlayersFromInput(input)
  const stored = intelligence.rbWomen
  const titlePlayer = titlePlayers[0] ?? null
  const storedPlayer = stored?.featuredPlayer ?? null
  const titleHasStoredPlayer = Boolean(storedPlayer && titleText.includes(storedPlayer.toLowerCase()))
  const playerEntity = titlePlayer && (!storedPlayer || !titleHasStoredPlayer)
    ? titlePlayer
    : storedPlayer ?? featuredPlayers[0] ?? null
  const titleHasCreditSignal = containsAny(titleText, ['assist', 'assists', 'credit distribution', 'who gets credit'])
  const titleProductionSignal = rbWomenProductionSignal(titleText)
  const storedAngle = stored?.rbAngle ?? null
  const rbAngle = titleProductionSignal && storedAngle === 'credit distribution' && !titleHasCreditSignal
    ? 'basketball evidence'
    : storedAngle ?? rbWomenEditorialAngle(text, stored?.contentPillar ?? 'elite_basketball')
  const planPlayers = playerEntity
    ? [playerEntity, ...featuredPlayers.filter((player) => player !== playerEntity && titleText.includes(player.toLowerCase()))]
    : featuredPlayers
  const storedAngleProtected = stored?.rbAngle === 'unequal visibility' ||
    stored?.rbAngle === 'media power' ||
    stored?.rbAngle === 'popularity versus production'
  const primarySearchTopic = titleProductionSignal && playerEntity && !storedAngleProtected
    ? `${playerEntity} production`
    : stored?.primarySearchTopic ?? rbWomenPrimarySearchTopic(input, planPlayers, stored?.debateTopic ?? null, stored?.contentPillar ?? 'elite_basketball', text)
  const copyNeedsRefresh =
    playerEntity !== storedPlayer ||
    rbAngle !== storedAngle ||
    titleProductionSignal
  const debateTopic = rbAngle === 'credit distribution'
    ? 'credit distribution'
    : rbAngle === 'popularity versus production'
      ? 'popularity versus production'
      : stored?.debateTopic ?? null
  const pillar = stored?.contentPillar ?? (titleProductionSignal ? 'elite_basketball' : 'women_sports_expansion')
  const suggestedCaption = copyNeedsRefresh
    ? rbWomenCaption({ pillar, featuredPlayer: playerEntity, featuredPlayers: planPlayers, debateTopic, primarySearchTopic, rbAngle })
    : intelligence.suggestedCaption
  const suggestedHashtags = copyNeedsRefresh
    ? uniqueHashtags([
      ...rbWomenHashtags(input, text, planPlayers, pillar, debateTopic),
      rbWomenAngleHashtag(rbAngle),
    ]).slice(0, 5)
    : intelligence.suggestedHashtags
  const topicLabel = debateTopic ?? signalSummary(input)
  const whyNow = copyNeedsRefresh
    ? truncate(`${stored?.scoutLabel === 'hold' ? 'Hold' : stored?.scoutLabel === 'develop' ? 'Develop' : 'Post now'}: ${primarySearchTopic} has ${topicLabel} plus ${rbAngle} inside the 72-hour RB Women scouting window.`, 180)
    : intelligence.whyNow
  const operatorSummary = copyNeedsRefresh
    ? truncate(`RB Women ${(stored?.scoutLabel ?? (intelligence.urgency === 'hold' ? 'hold' : 'post_now')).replace(/_/g, ' ')}: ${Math.max(intelligence.score, Number(input.ai_score ?? 0))}/100 on ${primarySearchTopic}. Lead with the basketball, frame the ${rbAngle} without forcing a race-only read.`, 180)
    : intelligence.operatorSummary

  return {
    clipTopic: primarySearchTopic,
    playerEntity,
    rbAngle,
    whyNow,
    operatorSummary,
    suggestedCaption,
    suggestedHashtags,
  }
}

function rbSportsPlanFields(
  input: RBHQIntelligenceInput,
  intelligence: RBHQIntelligenceV1,
  fallback: ReturnType<typeof rbWomenPlanFields>,
): ReturnType<typeof rbWomenPlanFields> & { teamEntity: string | null } {
  if (input.channel_id !== 'a1000000-0000-0000-0000-000000000001' && laneLabel(input) !== 'RB Sports') {
    return { ...fallback, teamEntity: null }
  }

  const text = textForSignals(input)
  const stored = intelligence.rbSports
  const entities = rbSportsEntitiesFromInput(input)
  const rbAngle = stored?.rbAngle ?? rbSportsAngle(text)
  const clipTopic = stored?.clipTopic ?? rbSportsTopicForAngle(rbAngle, entities, input)
  const playerEntity = stored?.playerEntity ?? entities.playerEntity
  const teamEntity = stored?.teamEntity ?? entities.teamEntity
  const subject = playerEntity ?? teamEntity ?? stored?.coachEntity ?? stored?.leagueEntity ?? sentenceCase(clipTopic)
  const suggestedCaption = intelligence.suggestedCaption || rbSportsCaption({ subject, angle: rbAngle })
  const suggestedHashtags = intelligence.suggestedHashtags.length > 0
    ? intelligence.suggestedHashtags
    : rbSportsHashtags(input, entities, rbAngle)

  return {
    clipTopic,
    playerEntity,
    teamEntity,
    rbAngle,
    whyNow: intelligence.whyNow,
    operatorSummary: intelligence.operatorSummary,
    suggestedCaption,
    suggestedHashtags,
  }
}

function sourceCandidateToPlanClip(source: SourceCandidateSummary): DailyContentPlanClip {
  const scoutLabel = source.scoutLabel ?? (
    source.urgency === 'post_now'
      ? 'post_now'
      : source.urgency === 'hold' || source.rankLabel === 'low_priority'
        ? 'hold'
        : 'develop'
  )
  const packageRenderStatus = source.packageRenderStatus ?? {
    packageId: null,
    clipPrepStatus: null,
    localRenderStatus: null,
    localRenderAttached: false,
    localAssetPath: null,
  }
  const transcriptSourceStatus = source.transcriptSourceStatus ?? {
    subtitleSource: null,
    transcriptTimed: null,
    sourceType: 'youtube_rss',
    sourceStatus: source.videoUrl ? 'available' : null,
  }
  return {
    id: source.id,
    title: source.title,
    clipTopic: source.hook || source.title,
    playerEntity: source.playerEntity ?? null,
    teamEntity: source.teamEntity ?? null,
    scoutLabel,
    rbAngle: source.rbAngle ?? null,
    channelId: source.targetLane === 'RB Women' ? 'a1000000-0000-0000-0000-000000000004' : null,
    lane: source.targetLane ?? 'RBHQ',
    sourceName: source.sourceName,
    score: source.score,
    rankLabel: source.rankLabel,
    urgency: source.urgency,
    reasons: source.reviewReason ? [source.reviewReason] : [],
    whyNow: source.whyNow,
    whyThisShouldPostNow: source.whyNow,
    operatorSummary: source.operatorSummary,
    suggestedCaption: source.suggestedCaption,
    captionDraft: source.suggestedCaption,
    suggestedHashtags: source.suggestedHashtags,
    hashtagPack: source.suggestedHashtags,
    packageRenderStatus,
    transcriptSourceStatus,
    reviewReason: source.reviewReason ?? (scoutLabel === 'post_now' ? null : source.operatorSummary),
    status: 'candidate',
    publishStatus: packageRenderStatus.localRenderAttached ? 'needs_clip_render' : 'not_ready',
    createdAt: source.publishedAt,
  }
}

export function buildDailyContentPlan<T extends RBHQIntelligenceInput & {
  status?: string | null
  publish_status?: string | null
}>(clips: T[], sourceCandidates: SourceCandidateSummary[] = [], input: { maxCandidates?: number | null } = {}): DailyContentPlan {
  const sourceCandidatePlanClips = clips.length === 0 && sourceCandidates.length > 0 && sourceCandidates.every((source) => source.targetLane === 'RB Women')
    ? sourceCandidates.map(sourceCandidateToPlanClip)
    : []
  const allPlanClips = [...clips.map(toPlanClip), ...sourceCandidatePlanClips].sort(byPriority)
  const rbWomenOnly = allPlanClips.length > 0 && allPlanClips.every(isRBWomenPlanClip)
  const rbSportsOnly = allPlanClips.length > 0 && allPlanClips.every(isRBSportsPlanClip)
  const planClips = rbWomenOnly
    ? selectRBWomenScoutCycle(allPlanClips, Math.max(1, Math.trunc(input.maxCandidates ?? 3)))
    : rbSportsOnly
      ? selectScoutCycle(allPlanClips, Math.max(1, Math.trunc(input.maxCandidates ?? 3)))
      : allPlanClips
  const topClipsToPostNow = planClips
    .filter((clip) => rbWomenOnly || rbSportsOnly ? clip.scoutLabel === 'post_now' : clip.urgency === 'post_now')
    .slice(0, rbWomenOnly || rbSportsOnly ? 1 : 6)
  const strongAlternates = planClips
    .filter((clip) =>
      !topClipsToPostNow.some((topClip) => topClip.id === clip.id) &&
      (rbWomenOnly || rbSportsOnly
        ? clip.scoutLabel === 'develop'
        : (clip.rankLabel === 'must_post' || clip.rankLabel === 'strong' || (clip.rankLabel === 'solid' && clip.urgency !== 'hold'))),
    )
    .slice(0, rbWomenOnly || rbSportsOnly ? 1 : 10)
  const holdOrLowPriority = planClips
    .filter((clip) => rbWomenOnly || rbSportsOnly ? clip.scoutLabel === 'hold' : clip.urgency === 'hold' || clip.rankLabel === 'low_priority')
    .slice(0, rbWomenOnly || rbSportsOnly ? 1 : 10)
  const suggestedPostingOrder = [...topClipsToPostNow, ...strongAlternates].sort(byPriority).slice(0, rbWomenOnly || rbSportsOnly ? 3 : 12)
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
    sourceCandidates,
  }
}
