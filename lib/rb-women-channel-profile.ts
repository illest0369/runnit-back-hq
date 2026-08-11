import { readFileSync } from 'node:fs'
import path from 'node:path'

export const RB_WOMEN_COMPETITIONS = [
  'WNBA',
  'NCAAW',
  'Unrivaled',
  'FIBA_WOMEN',
  'WOMENS_PRO_BASKETBALL',
  'GIRLS_ELITE_BASKETBALL',
  'WOMENS_BASKETBALL_HISTORY',
] as const

export const RB_WOMEN_MOMENT_TYPES = [
  'game_winner',
  'clutch_sequence',
  'dominant_play',
  'crossover_or_highlight',
  'confrontation',
  'controversial_call',
  'injury_or_return',
  'press_conference_quote',
  'player_reaction',
  'coach_reaction',
  'rivalry',
  'trash_talk',
  'tactical_insight',
  'personal_story',
  'funny_personality',
  'behind_the_scenes',
  'style_or_culture',
  'labor_or_business',
  'media_coverage',
  'leadership',
  'history',
  'breaking_news',
] as const

export const RB_WOMEN_REJECTION_CODES = [
  'REJECT_WRONG_SPORT',
  'REJECT_MENS_COMPETITION',
  'REJECT_ADJACENT_WOMAN_ONLY',
  'REJECT_NO_WBB_ENTITY',
  'REJECT_WBB_NOT_PRIMARY',
  'REJECT_GENERIC_OR_PROMOTIONAL',
  'REJECT_INSUFFICIENT_CONTEXT',
] as const

export type RBWomenCompetition = typeof RB_WOMEN_COMPETITIONS[number]
export type RBWomenMomentType = typeof RB_WOMEN_MOMENT_TYPES[number]
export type RBWomenRejectionCode = typeof RB_WOMEN_REJECTION_CODES[number]
export type RBWomenRightsMode = 'owned' | 'licensed' | 'approved_ingest' | 'discovery_only' | 'manual_review'
export type RBWomenSourceTier = 'A_OFFICIAL_RIGHTS_CLEARED' | 'B_EDITORIAL_DISCOVERY' | 'C_CONTEXT_ANALYSIS'

export type RBWomenSourceRecord = {
  channelName: string
  channelHandle: string
  sourceTier: RBWomenSourceTier
  contentTypes: string[]
  competitionsCovered: string[]
  rightsMode: RBWomenRightsMode
  editorialStrengths: string[]
  enabled: boolean
  notes: string
}

export type RBWomenEditorialCandidateInput = {
  start_seconds: number
  end_seconds: number
  transcript_summary: string
  opening_line: string
  subject: string
  visual_context: string
  rb_women_angle: string
  viral_reason: string
  confidence: number
  womens_basketball_primary_subject: boolean
  competition: string
  primary_subject_type: string
  primary_subject_names: string[]
  team_names: string[]
  player_names: string[]
  coach_names: string[]
  event_type: string
  moment_type: RBWomenMomentType
  rb_women_lanes: string[]
  standalone_context: boolean
  why_fans_care: string
  audience_fit_reason: string
  source_reliability: number
  timeliness: number
  visual_action_score: number
  emotional_stakes_score: number
  debate_score: number
  personality_score: number
  undercovered_story_score: number
  editorial_fit_score: number
  eligibility: boolean
  rejection_codes: RBWomenRejectionCode[]
}

export type RBWomenCandidateEvaluation = {
  candidate: RBWomenEditorialCandidateInput
  eligible: boolean
  rejectionCodes: RBWomenRejectionCode[]
  score: number
  scoreBreakdown: Record<string, number>
  boosts: string[]
  penalties: string[]
  rbWomenLane: string
  namedSearchEntities: string[]
  selectionReason: string
  youtubeShortsTitle: string
  queueDiversity: {
    mixCategory: string
    dailyTargetPercent: number
    maxSamePlayerInFivePostWindow: 2
    maxSameSourceInDailyBatch: 2
  }
}

export type RBWomenEditorialGateResult = {
  eligible: RBWomenCandidateEvaluation[]
  rejected: RBWomenCandidateEvaluation[]
}

export const RB_WOMEN_CHANNEL_PROFILE = {
  audience: [
    'Predominantly Black and brown millennials in their late 20s through early 40s.',
    'Sports fans with regular jobs who also care about culture, style, sneakers, music, brunch, player personality, and athlete treatment.',
    'Fan-native rather than broadcaster-like.',
  ],
  editorialMission: [
    'Surface the moments women’s basketball fans are already discussing.',
    'Give proportionally stronger visibility to Black and brown players, coaches, and stories that receive less mainstream attention.',
    'Treat women’s basketball as real competitive sports, not novelty or inspiration-only content.',
  ],
  representationRule: 'Use curated editorial metadata only. Never infer race or ethnicity from a face, image, surname, or Gemini output.',
  competitions: RB_WOMEN_COMPETITIONS,
  scoringWeights: {
    womensBasketballSubjectStrength: 25,
    clarityAndStandaloneOpening: 15,
    competitiveOrEmotionalStakes: 15,
    fanConversationRelevance: 15,
    playerTeamRecognizability: 10,
    undercoveredStoryUpside: 10,
    visualQualityAction: 5,
    rbWomenEditorialLaneStrength: 5,
  },
  boosts: {
    clearQuoteOrArgument: 8,
    clutchHighStakesAction: 8,
    rivalryOrDefensibleDebate: 6,
    candidPersonalityOrChemistry: 6,
    laborMediaPowerAngle: 6,
    curatedBlackBrownPlayerCoachStory: 5,
    paigeBueckersAudienceAffinity: 4,
    starPlayerMoment: 6,
    unusualStatOrPerformance: 5,
    disrespectOrTrashTalk: 5,
  },
  penalties: {
    adjacentWomanOnly: -100,
    mensCompetition: -100,
    noNamedWbbEntity: -50,
    genericRecapNoDistinctMoment: -20,
    excessiveSetup: -15,
    repeatedPlayerTopic: -15,
    caitlinClarkDefault: -8,
    genericPlayByPlay: -14,
    weakPayoff: -10,
  },
  dailyContentMix: {
    competitive_game_moments: 35,
    personality_access_behind_the_scenes: 20,
    debate_rivalry_controversy: 15,
    labor_business_media_power: 10,
    coaching_leadership: 10,
    history_style_representation_culture: 10,
  },
  diversityRules: {
    maxSamePlayerInFivePostWindow: 2,
    maxSameSourceInDailyBatch: 2,
    maintainScoutingWindowHours: 72,
  },
} as const

const CURATED_REPRESENTATION_BOOST_ENTITIES = new Set([
  'aja wilson',
  'a’ja wilson',
  'angel reese',
  'aliyah boston',
  'arike ogunbowale',
  'dawn staley',
  'napheesa collier',
  'skylar diggins',
])

function compact(value: unknown, maxLength = 500): string {
  const clean = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  if (clean.length <= maxLength) return clean
  return `${clean.slice(0, maxLength - 3).trim()}...`
}

function lower(value: unknown): string {
  return compact(typeof value === 'string' ? value : '').toLowerCase()
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function normalizeStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of values.map((item) => compact(item, 80)).filter(Boolean)) {
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    output.push(value)
  }
  return output
}

function normalizedCompetition(value: string): RBWomenCompetition | null {
  const clean = compact(value, 80).toUpperCase().replace(/\s+/g, '_')
  if (clean === 'UNRIVALED') return 'Unrivaled'
  if (clean === 'WOMENS_BASKETBALL_HISTORY' || clean === 'WOMEN_S_BASKETBALL_HISTORY') return 'WOMENS_BASKETBALL_HISTORY'
  return RB_WOMEN_COMPETITIONS.find((competition) => competition.toUpperCase() === clean) ?? null
}

function textForCandidate(candidate: RBWomenEditorialCandidateInput): string {
  return [
    candidate.transcript_summary,
    candidate.opening_line,
    candidate.subject,
    candidate.visual_context,
    candidate.rb_women_angle,
    candidate.viral_reason,
    candidate.competition,
    candidate.primary_subject_type,
    candidate.event_type,
    candidate.moment_type,
    ...candidate.primary_subject_names,
    ...candidate.team_names,
    ...candidate.player_names,
    ...candidate.coach_names,
    ...candidate.rb_women_lanes,
  ].join(' ').toLowerCase()
}

function isMensCompetition(text: string): boolean {
  return /\b(men'?s|male|nba|nfl|mlb|pga|ufc|men'?s college|ncaa men|pba|bowling|bowlers?|baseball|football)\b/i.test(text)
}

function isWrongSport(text: string): boolean {
  return /\b(bowling|football|baseball|soccer|hockey|golf|tennis|combat|boxing|mma|nascar|formula 1|f1)\b/i.test(text) &&
    !/\b(wbb|wnba|ncaaw|women'?s basketball|unrivaled)\b/i.test(text)
}

function isAdjacentWomanOnly(candidate: RBWomenEditorialCandidateInput, text: string): boolean {
  const subjectType = lower(candidate.primary_subject_type)
  const reporterOnly = /\b(reporter|journalist|interviewer|host|commentator|analyst|sideline)\b/.test(subjectType)
  const hasPlayerCoachTeam = [...candidate.player_names, ...candidate.coach_names, ...candidate.team_names].length > 0
  return reporterOnly && !hasPlayerCoachTeam || /\bfemale (reporter|host|journalist|interviewer).*\b(male|men'?s|man|athlete|player|bowler)\b/.test(text)
}

function isGenericPromotional(text: string): boolean {
  return /\b(sponsor|sponsored|commercial|promo|promotion|subscribe|tickets|merch|giveaway|ad break)\b/i.test(text)
}

function hasNamedWbbEntity(candidate: RBWomenEditorialCandidateInput): boolean {
  return normalizeStrings([
    ...candidate.player_names,
    ...candidate.coach_names,
    ...candidate.team_names,
    ...candidate.primary_subject_names,
  ]).length > 0
}

function mixCategoryFor(candidate: RBWomenEditorialCandidateInput): { mixCategory: string; dailyTargetPercent: number } {
  switch (candidate.moment_type) {
    case 'game_winner':
    case 'clutch_sequence':
    case 'dominant_play':
    case 'crossover_or_highlight':
    case 'controversial_call':
      return { mixCategory: 'competitive_game_moments', dailyTargetPercent: 35 }
    case 'behind_the_scenes':
    case 'funny_personality':
    case 'personal_story':
    case 'player_reaction':
      return { mixCategory: 'personality_access_behind_the_scenes', dailyTargetPercent: 20 }
    case 'rivalry':
    case 'trash_talk':
    case 'confrontation':
      return { mixCategory: 'debate_rivalry_controversy', dailyTargetPercent: 15 }
    case 'labor_or_business':
    case 'media_coverage':
      return { mixCategory: 'labor_business_media_power', dailyTargetPercent: 10 }
    case 'coach_reaction':
    case 'leadership':
    case 'tactical_insight':
      return { mixCategory: 'coaching_leadership', dailyTargetPercent: 10 }
    default:
      return { mixCategory: 'history_style_representation_culture', dailyTargetPercent: 10 }
  }
}

function hasCuratedRepresentationBoost(candidate: RBWomenEditorialCandidateInput): boolean {
  const names = normalizeStrings([...candidate.player_names, ...candidate.coach_names, ...candidate.primary_subject_names])
  return names.some((name) => CURATED_REPRESENTATION_BOOST_ENTITIES.has(name.toLowerCase()))
}

function numericScore(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
}

export function evaluateRBWomenCandidate(candidate: RBWomenEditorialCandidateInput): RBWomenCandidateEvaluation {
  const text = textForCandidate(candidate)
  const competition = normalizedCompetition(candidate.competition)
  const rejectionCodes = new Set<RBWomenRejectionCode>(candidate.rejection_codes ?? [])
  const namedWbbEntity = hasNamedWbbEntity(candidate)

  if (isWrongSport(text)) rejectionCodes.add('REJECT_WRONG_SPORT')
  if (isMensCompetition(text)) rejectionCodes.add('REJECT_MENS_COMPETITION')
  if (isAdjacentWomanOnly(candidate, text)) rejectionCodes.add('REJECT_ADJACENT_WOMAN_ONLY')
  if (!namedWbbEntity) rejectionCodes.add('REJECT_NO_WBB_ENTITY')
  if (!candidate.womens_basketball_primary_subject || !competition || !candidate.eligibility) {
    rejectionCodes.add('REJECT_WBB_NOT_PRIMARY')
  }
  if (isGenericPromotional(text)) rejectionCodes.add('REJECT_GENERIC_OR_PROMOTIONAL')
  if (!candidate.standalone_context) rejectionCodes.add('REJECT_INSUFFICIENT_CONTEXT')

  const eligible = rejectionCodes.size === 0
  const clarity = candidate.standalone_context && compact(candidate.opening_line).length >= 12 ? 15 : 4
  const stakes = Math.max(numericScore(candidate.emotional_stakes_score), numericScore(candidate.debate_score)) * 0.15
  const fanConversation = ((numericScore(candidate.timeliness) + numericScore(candidate.source_reliability)) / 2) * 0.15
  const recognizability = namedWbbEntity ? 10 : 0
  const undercovered = numericScore(candidate.undercovered_story_score) * 0.10
  const visual = numericScore(candidate.visual_action_score) * 0.05
  const laneStrength = numericScore(candidate.editorial_fit_score) * 0.05
  const subjectStrength = candidate.womens_basketball_primary_subject && competition && namedWbbEntity ? 25 : 0
  const scoreBreakdown = {
    womensBasketballSubjectStrength: subjectStrength,
    clarityAndStandaloneOpening: clarity,
    competitiveOrEmotionalStakes: stakes,
    fanConversationRelevance: fanConversation,
    playerTeamRecognizability: recognizability,
    undercoveredStoryUpside: undercovered,
    visualQualityAction: visual,
    rbWomenEditorialLaneStrength: laneStrength,
  }

  const boosts: string[] = []
  let boostTotal = 0
  if (/\b(said|quote|asked|responded|argued|called out|because|i think|we)\b/i.test(text)) {
    boostTotal += RB_WOMEN_CHANNEL_PROFILE.boosts.clearQuoteOrArgument
    boosts.push('clear_quote_or_argument')
  }
  if (['game_winner', 'clutch_sequence', 'dominant_play'].includes(candidate.moment_type)) {
    boostTotal += RB_WOMEN_CHANNEL_PROFILE.boosts.clutchHighStakesAction
    boosts.push('clutch_or_high_stakes_action')
  }
  if (['rivalry', 'trash_talk', 'confrontation', 'controversial_call'].includes(candidate.moment_type)) {
    boostTotal += RB_WOMEN_CHANNEL_PROFILE.boosts.rivalryOrDefensibleDebate
    boosts.push('rivalry_or_defensible_debate')
  }
  if (['funny_personality', 'behind_the_scenes', 'player_reaction'].includes(candidate.moment_type)) {
    boostTotal += RB_WOMEN_CHANNEL_PROFILE.boosts.candidPersonalityOrChemistry
    boosts.push('candid_personality_or_chemistry')
  }
  if (['labor_or_business', 'media_coverage'].includes(candidate.moment_type)) {
    boostTotal += RB_WOMEN_CHANNEL_PROFILE.boosts.laborMediaPowerAngle
    boosts.push('labor_or_media_power_angle')
  }
  if (hasCuratedRepresentationBoost(candidate)) {
    boostTotal += RB_WOMEN_CHANNEL_PROFILE.boosts.curatedBlackBrownPlayerCoachStory
    boosts.push('curated_black_or_brown_player_coach_story')
  }
  if (text.includes('paige bueckers')) {
    boostTotal += RB_WOMEN_CHANNEL_PROFILE.boosts.paigeBueckersAudienceAffinity
    boosts.push('paige_bueckers_audience_affinity')
  }
  if (/\b(paige bueckers|aja wilson|a’ja wilson|angel reese|caitlin clark|kelsey mitchell|sabrina ionescu|breanna stewart|napheesa collier|arike ogunbowale|aliyah boston)\b/i.test(text)) {
    boostTotal += RB_WOMEN_CHANNEL_PROFILE.boosts.starPlayerMoment
    boosts.push('star_player')
  }
  if (/\b(30|33|34|40|45|triple[- ]double|career[- ]high|record|historic|explodes?|puts on a show|stays hot)\b/i.test(text)) {
    boostTotal += RB_WOMEN_CHANNEL_PROFILE.boosts.unusualStatOrPerformance
    boosts.push('unusual_stat_or_performance')
  }
  if (/\b(disrespect|trash talk|taunt|called out|sent it back|blocked|rejected|down to earth|staredown)\b/i.test(text)) {
    boostTotal += RB_WOMEN_CHANNEL_PROFILE.boosts.disrespectOrTrashTalk
    boosts.push('disrespect_or_reaction')
  }

  const penalties: string[] = []
  let penaltyTotal = 0
  if (rejectionCodes.has('REJECT_ADJACENT_WOMAN_ONLY')) {
    penaltyTotal += RB_WOMEN_CHANNEL_PROFILE.penalties.adjacentWomanOnly
    penalties.push('female_reporter_only_connection')
  }
  if (rejectionCodes.has('REJECT_MENS_COMPETITION')) {
    penaltyTotal += RB_WOMEN_CHANNEL_PROFILE.penalties.mensCompetition
    penalties.push('mens_competition')
  }
  if (rejectionCodes.has('REJECT_NO_WBB_ENTITY')) {
    penaltyTotal += RB_WOMEN_CHANNEL_PROFILE.penalties.noNamedWbbEntity
    penalties.push('no_named_wbb_entity')
  }
  if (/\b(recap|roundup)\b/i.test(text) && numericScore(candidate.editorial_fit_score) < 60) {
    penaltyTotal += RB_WOMEN_CHANNEL_PROFILE.penalties.genericRecapNoDistinctMoment
    penalties.push('generic_recap_no_distinct_moment')
  }
  if (!candidate.standalone_context) {
    penaltyTotal += RB_WOMEN_CHANNEL_PROFILE.penalties.excessiveSetup
    penalties.push('requires_too_much_setup')
  }
  if (/\b(starting to go on a run|sweet touch|silky smooth|finds .* for two|lays? it in|knocks? it down)\b/i.test(candidate.opening_line) &&
      !['game_winner', 'clutch_sequence', 'dominant_play', 'crossover_or_highlight', 'controversial_call', 'trash_talk'].includes(candidate.moment_type)) {
    penaltyTotal += RB_WOMEN_CHANNEL_PROFILE.penalties.genericPlayByPlay
    penalties.push('generic_play_by_play_open')
  }
  if (numericScore(candidate.debate_score) < 45 && numericScore(candidate.emotional_stakes_score) < 55 && numericScore(candidate.personality_score) < 50 && numericScore(candidate.visual_action_score) < 70) {
    penaltyTotal += RB_WOMEN_CHANNEL_PROFILE.penalties.weakPayoff
    penalties.push('weak_payoff')
  }

  const preAffinityScore = Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0) + boostTotal + penaltyTotal
  if (text.includes('caitlin clark') && preAffinityScore < 85) {
    penaltyTotal += RB_WOMEN_CHANNEL_PROFILE.penalties.caitlinClarkDefault
    penalties.push('caitlin_clark_default_penalty_below_major_novel_threshold')
  }

  const score = eligible ? clampScore(Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0) + boostTotal + penaltyTotal) : 0
  const namedSearchEntities = normalizeStrings([
    ...candidate.player_names,
    ...candidate.coach_names,
    ...candidate.team_names,
    ...candidate.primary_subject_names,
    competition ?? '',
  ])
  const mix = mixCategoryFor(candidate)
  const lane = compact(candidate.rb_women_lanes[0], 80) || mix.mixCategory

  return {
    candidate,
    eligible,
    rejectionCodes: [...rejectionCodes],
    score,
    scoreBreakdown,
    boosts,
    penalties,
    rbWomenLane: lane,
    namedSearchEntities,
    selectionReason: compact(candidate.why_fans_care || candidate.viral_reason || candidate.audience_fit_reason, 260),
    youtubeShortsTitle: compact(`${namedSearchEntities[0] ?? candidate.subject}: ${candidate.opening_line}`, 95),
    queueDiversity: {
      ...mix,
      maxSamePlayerInFivePostWindow: 2,
      maxSameSourceInDailyBatch: 2,
    },
  }
}

export function evaluateRBWomenCandidates(candidates: RBWomenEditorialCandidateInput[]): RBWomenEditorialGateResult {
  const evaluated = candidates.map(evaluateRBWomenCandidate)
  return {
    eligible: evaluated.filter((item) => item.eligible).sort((left, right) => right.score - left.score),
    rejected: evaluated.filter((item) => !item.eligible),
  }
}

export function loadRBWomenSourceRegistry(registryPath = path.join(process.cwd(), 'config', 'rb-women-youtube-sources.json')): RBWomenSourceRecord[] {
  const parsed = JSON.parse(readFileSync(registryPath, 'utf8')) as RBWomenSourceRecord[]
  return parsed
}

export function resolveRBWomenSourceRecord(sourceUrlOrRef: string, registry = loadRBWomenSourceRegistry()): RBWomenSourceRecord | null {
  const source = lower(sourceUrlOrRef)
  return registry.find((record) => {
    if (!record.enabled) return false
    const handle = lower(record.channelHandle).replace(/^@/, '')
    const name = lower(record.channelName).replace(/[^a-z0-9]+/g, '')
    const sourceCompact = source.replace(/[^a-z0-9]+/g, '')
    return Boolean(handle && source.includes(handle)) || Boolean(name && sourceCompact.includes(name))
  }) ?? null
}
