export const RB_COMBAT_CHANNEL_ID = 'a1000000-0000-0000-0000-000000000003'

export type RBCombatSourcePriority = 'core' | 'useful' | 'experimental' | 'disabled_noisy'
export type RBCombatSourceTreatment = 'advanced' | 'held' | 'rejected'
export type RBCombatSourceCategory =
  | 'official_promotion_channel'
  | 'official_league_event_channel'
  | 'trusted_broadcast_highlight'
  | 'trusted_combat_media_interview'
  | 'discovery_fighter_reaction'
  | 'disabled_noise'

export type RBCombatDiscipline = 'mma' | 'boxing' | 'mixed' | 'kickboxing' | 'unknown'

export type RBCombatPhase1Source = {
  channelKey: string
  displayName: string
  category: RBCombatSourceCategory
  priority: RBCombatSourcePriority
  discipline: RBCombatDiscipline
  promotionOrPublisher: string
  sourcePriorityScore: number
  active: boolean
  usefulFor: string[]
  noisyIf: string[]
  rejectIf: string[]
  boostIf: string[]
}

export type RBCombatSourceCandidateFilter = {
  treatment: RBCombatSourceTreatment
  reasons: string[]
  sourcePriority: RBCombatSourcePriority | 'unknown'
  sourcePriorityScore: number
  sourceCategory: RBCombatSourceCategory | 'unknown'
  discipline: RBCombatDiscipline | 'unknown'
  promotionOrPublisher: string | null
}

export const RB_COMBAT_PHASE1_SOURCES: RBCombatPhase1Source[] = [
  {
    channelKey: 'ufc_official',
    displayName: 'UFC',
    category: 'official_promotion_channel',
    priority: 'core',
    discipline: 'mma',
    promotionOrPublisher: 'UFC',
    sourcePriorityScore: 98,
    active: true,
    usefulFor: ['knockouts', 'submissions', 'stare_downs', 'weigh_ins', 'press_conference_tension', 'title_fight_stakes'],
    noisyIf: ['pay-per-view promo filler', 'ticket promo', 'generic fight week montage'],
    rejectIf: ['sponsor ad only', 'full event replay without timestamp', 'generic merch promo'],
    boostIf: ['knockout', 'submission', 'faceoff', 'weigh-in', 'press conference', 'title fight', 'calls out'],
  },
  {
    channelKey: 'espn_mma',
    displayName: 'ESPN MMA',
    category: 'trusted_broadcast_highlight',
    priority: 'core',
    discipline: 'mma',
    promotionOrPublisher: 'ESPN MMA',
    sourcePriorityScore: 92,
    active: true,
    usefulFor: ['fighter_quotes', 'injury_withdrawal_news', 'callouts', 'press_conference_tension', 'bad_judging'],
    noisyIf: ['long studio segment', 'full interview without timestamp', 'generic preview'],
    rejectIf: ['betting-only content', 'full podcast without timestamp'],
    boostIf: ['breaking', 'injury', 'withdrawal', 'calls out', 'reacts', 'controversial decision', 'press conference'],
  },
  {
    channelKey: 'one_championship',
    displayName: 'ONE Championship',
    category: 'official_promotion_channel',
    priority: 'core',
    discipline: 'mixed',
    promotionOrPublisher: 'ONE Championship',
    sourcePriorityScore: 90,
    active: true,
    usefulFor: ['knockouts', 'submissions', 'title_fight_stakes', 'rivalry_heat', 'viral_fighter_quotes'],
    noisyIf: ['old fight repost', 'low-context highlight compilation', 'generic training montage'],
    rejectIf: ['stale repost without new context', 'compilation without named fighter or event'],
    boostIf: ['knockout', 'submission', 'world title', 'staredown', 'callout', 'heated'],
  },
  {
    channelKey: 'pfl_mma',
    displayName: 'PFL MMA',
    category: 'official_league_event_channel',
    priority: 'useful',
    discipline: 'mma',
    promotionOrPublisher: 'PFL',
    sourcePriorityScore: 84,
    active: true,
    usefulFor: ['playoff_stakes', 'title_fight_stakes', 'fighter_stories', 'finishes', 'weigh_ins'],
    noisyIf: ['generic standings update', 'low-context season recap', 'training footage'],
    rejectIf: ['generic rankings without fighter angle', 'schedule announcement only'],
    boostIf: ['playoffs', 'championship', 'knockout', 'submission', 'million dollar', 'faceoff'],
  },
  {
    channelKey: 'dazn_boxing',
    displayName: 'DAZN Boxing',
    category: 'trusted_broadcast_highlight',
    priority: 'core',
    discipline: 'boxing',
    promotionOrPublisher: 'DAZN Boxing',
    sourcePriorityScore: 88,
    active: true,
    usefulFor: ['boxing_knockouts', 'stare_downs', 'weigh_ins', 'press_conference_tension', 'fighter_quotes'],
    noisyIf: ['low-context boxing compilation', 'full fight repost', 'betting odds segment'],
    rejectIf: ['old fight repost without new context', 'betting-pick content'],
    boostIf: ['knockout', 'faceoff', 'weigh-in', 'press conference', 'calls out', 'world title'],
  },
  {
    channelKey: 'top_rank_boxing',
    displayName: 'Top Rank Boxing',
    category: 'official_promotion_channel',
    priority: 'useful',
    discipline: 'boxing',
    promotionOrPublisher: 'Top Rank Boxing',
    sourcePriorityScore: 84,
    active: true,
    usefulFor: ['boxing_knockouts', 'title_fight_stakes', 'press_conference_tension', 'fighter_quotes'],
    noisyIf: ['classic fight repost', 'generic ranking', 'full fight without current hook'],
    rejectIf: ['old fight repost without new context', 'ticket promo only'],
    boostIf: ['knockout', 'title fight', 'press conference', 'heated', 'calls out', 'weigh-in'],
  },
  {
    channelKey: 'matchroom_boxing',
    displayName: 'Matchroom Boxing',
    category: 'official_promotion_channel',
    priority: 'useful',
    discipline: 'boxing',
    promotionOrPublisher: 'Matchroom Boxing',
    sourcePriorityScore: 84,
    active: true,
    usefulFor: ['stare_downs', 'weigh_ins', 'press_conference_tension', 'fighter_callouts', 'rivalry_heat'],
    noisyIf: ['ticket promo', 'generic event trailer', 'long interview without timestamp'],
    rejectIf: ['sponsor ad only', 'event promo without fighter quote or tension'],
    boostIf: ['faceoff', 'weigh-in', 'press conference', 'heated', 'calls out', 'world title'],
  },
  {
    channelKey: 'mma_fighting',
    displayName: 'MMA Fighting',
    category: 'trusted_combat_media_interview',
    priority: 'useful',
    discipline: 'mma',
    promotionOrPublisher: 'MMA Fighting',
    sourcePriorityScore: 82,
    active: true,
    usefulFor: ['fighter_quotes', 'callouts', 'injury_withdrawal_news', 'rivalry_heat', 'bad_judging'],
    noisyIf: ['long podcast without timestamps', 'roundtable preview', 'context-heavy debate'],
    rejectIf: ['full podcast without timestamp or clip payoff'],
    boostIf: ['exclusive', 'calls out', 'responds', 'controversial decision', 'injury', 'withdrawal', 'post-fight'],
  },
  {
    channelKey: 'ufc_fight_pass',
    displayName: 'UFC FIGHT PASS',
    category: 'official_league_event_channel',
    priority: 'experimental',
    discipline: 'mma',
    promotionOrPublisher: 'UFC FIGHT PASS',
    sourcePriorityScore: 62,
    active: false,
    usefulFor: ['archive_context', 'event_context'],
    noisyIf: ['old fight repost', 'archive clip without new context', 'low-context compilation'],
    rejectIf: ['stale repost without current fight-week or post-fight hook'],
    boostIf: ['current event tie', 'fighter comeback context', 'title fight setup'],
  },
  {
    channelKey: 'bellator_mma',
    displayName: 'BellatorMMA',
    category: 'official_league_event_channel',
    priority: 'experimental',
    discipline: 'mma',
    promotionOrPublisher: 'Bellator MMA',
    sourcePriorityScore: 58,
    active: false,
    usefulFor: ['historical_context', 'fight_archive'],
    noisyIf: ['archive/current mix', 'stale fight repost', 'low-context highlight package'],
    rejectIf: ['old fight repost without new context'],
    boostIf: ['current PFL/Bellator event tie', 'recognized fighter callout'],
  },
  {
    channelKey: 'combat_fighter_reactions_discovery',
    displayName: 'Combat Fighter Reactions Discovery',
    category: 'discovery_fighter_reaction',
    priority: 'experimental',
    discipline: 'mixed',
    promotionOrPublisher: 'Discovery',
    sourcePriorityScore: 35,
    active: false,
    usefulFor: ['fighter_reactions', 'fan_debate'],
    noisyIf: ['creator-first framing', 'low-context reaction', 'requires outside context'],
    rejectIf: ['no fighter, promotion, event, quote, or visible fight moment'],
    boostIf: ['recognizable fighter reacting to current fight-week or post-fight story'],
  },
  {
    channelKey: 'combat_betting_picks_watchlist',
    displayName: 'Combat Betting Picks Watchlist',
    category: 'disabled_noise',
    priority: 'disabled_noisy',
    discipline: 'mixed',
    promotionOrPublisher: 'Disabled Watchlist',
    sourcePriorityScore: 0,
    active: false,
    usefulFor: [],
    noisyIf: ['odds', 'parlay', 'prop bet', 'best bets', 'betting pick'],
    rejectIf: ['betting-pick content', 'odds-first segment'],
    boostIf: [],
  },
  {
    channelKey: 'combat_longform_podcast_watchlist',
    displayName: 'Combat Longform Podcast Watchlist',
    category: 'disabled_noise',
    priority: 'disabled_noisy',
    discipline: 'mixed',
    promotionOrPublisher: 'Disabled Watchlist',
    sourcePriorityScore: 0,
    active: false,
    usefulFor: [],
    noisyIf: ['full episode', 'podcast', 'live stream', 'livestream', 'three-hour show'],
    rejectIf: ['long podcast without timestamps'],
    boostIf: [],
  },
  {
    channelKey: 'combat_stale_reposts_watchlist',
    displayName: 'Combat Stale Reposts Watchlist',
    category: 'disabled_noise',
    priority: 'disabled_noisy',
    discipline: 'mixed',
    promotionOrPublisher: 'Disabled Watchlist',
    sourcePriorityScore: 0,
    active: false,
    usefulFor: [],
    noisyIf: ['classic fight', 'throwback', 'on this day', 'full fight', 'free fight'],
    rejectIf: ['old fight repost without new context'],
    boostIf: [],
  },
]

const BETTING_PICK_PATTERNS = [
  'betting',
  'best bet',
  'best bets',
  'odds',
  'parlay',
  'prop bet',
  'props',
  'underdog pick',
  'favorite pick',
  'sportsbook',
  'draftkings',
  'fanduel',
]

const LONG_CONTEXT_PATTERNS = [
  'full episode',
  'podcast',
  'live stream',
  'livestream',
  'three-hour show',
  'full show',
  'without timestamps',
]

const FILLER_PATTERNS = [
  'ranking',
  'rankings',
  'top 10',
  'pound-for-pound list',
  'p4p list',
  'schedule',
  'tickets',
  'ticket',
  'merch',
  'sponsor',
  'sponsored',
  'presented by',
]

const STALE_REPOST_PATTERNS = [
  'classic fight',
  'throwback',
  'on this day',
  'full fight',
  'free fight',
  'fight marathon',
  'highlight compilation',
  'best knockouts compilation',
]

const TRAINING_FOOTAGE_PATTERNS = [
  'training footage',
  'open workout',
  'workout highlights',
  'sparring footage',
  'gym session',
  'road work',
]

const BOOST_PATTERNS = [
  'knockout',
  'submission',
  'stoppage',
  'tap out',
  'faceoff',
  'face-off',
  'staredown',
  'stare-down',
  'weigh-in',
  'weigh in',
  'press conference',
  'calls out',
  'called out',
  'callout',
  'heated',
  'trash talk',
  'controversial decision',
  'bad judging',
  'robbery',
  'split decision',
  'injury',
  'withdrawal',
  'replacement',
  'short notice',
  'title fight',
  'world title',
  'championship',
  'belt',
  'rivalry',
  'beef',
  'viral quote',
  'post-fight',
  'fight week',
]

function normalize(value: string | null | undefined): string {
  return value?.toLowerCase().replace(/\s+/g, ' ').trim() ?? ''
}

function includesAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern))
}

export function rbCombatPhase1SourceForKey(channelKey: string | null | undefined): RBCombatPhase1Source | null {
  const key = normalize(channelKey).replace(/[^a-z0-9_]+/g, '')
  return RB_COMBAT_PHASE1_SOURCES.find((source) => source.channelKey === key) ?? null
}

export function rbCombatPhase1ActiveSources(): RBCombatPhase1Source[] {
  return RB_COMBAT_PHASE1_SOURCES.filter((source) => source.active)
}

export function rbCombatPhase1NoisySources(): RBCombatPhase1Source[] {
  return RB_COMBAT_PHASE1_SOURCES.filter((source) => !source.active || source.priority === 'disabled_noisy')
}

export function classifyRBCombatSourceCandidate(input: {
  channelKey?: string | null
  title?: string | null
  description?: string | null
  score?: number | null
}): RBCombatSourceCandidateFilter {
  const source = rbCombatPhase1SourceForKey(input.channelKey)
  const text = normalize(`${input.title ?? ''} ${input.description ?? ''}`)
  const score = typeof input.score === 'number' && Number.isFinite(input.score) ? input.score : 0
  const reasons: string[] = []

  if (!source) {
    return {
      treatment: score >= 70 ? 'held' : 'rejected',
      reasons: ['RB Combat source is not in the Phase 1 curated feed set.'],
      sourcePriority: 'unknown',
      sourcePriorityScore: 0,
      sourceCategory: 'unknown',
      discipline: 'unknown',
      promotionOrPublisher: null,
    }
  }

  if (!source.active) {
    return {
      treatment: 'rejected',
      reasons: [`${source.displayName} is disabled/noisy for RB Combat Phase 1.`],
      sourcePriority: source.priority,
      sourcePriorityScore: source.sourcePriorityScore,
      sourceCategory: source.category,
      discipline: source.discipline,
      promotionOrPublisher: source.promotionOrPublisher,
    }
  }

  const bettingPick = includesAny(text, BETTING_PICK_PATTERNS)
  const longContext = includesAny(text, LONG_CONTEXT_PATTERNS)
  const filler = includesAny(text, FILLER_PATTERNS)
  const staleRepost = includesAny(text, STALE_REPOST_PATTERNS)
  const trainingFootage = includesAny(text, TRAINING_FOOTAGE_PATTERNS)
  const boosted = includesAny(text, BOOST_PATTERNS)

  if (bettingPick) reasons.push('Reject: betting-pick content is out of scope for RB Combat Phase 1.')
  if (longContext && !boosted) reasons.push('Hold: long combat podcast or stream needs timestamps or a clear short-form payoff.')
  if (filler && !boosted) reasons.push('Reject/hold: ranking, schedule, merch, or sponsor filler without a fight moment.')
  if (staleRepost && !boosted) reasons.push('Hold: stale fight repost or compilation needs new fight-week or post-fight context.')
  if (trainingFootage && !boosted) reasons.push('Hold: generic training footage needs a fighter, opponent, injury, quote, or fight angle.')
  if (boosted) reasons.push('Boost: combat-native finish, callout, title, controversy, or fight-week signal fits RB Combat priorities.')

  if (bettingPick || (filler && !boosted)) {
    return {
      treatment: 'rejected',
      reasons: reasons.length ? reasons : ['Rejected by RB Combat source filters.'],
      sourcePriority: source.priority,
      sourcePriorityScore: source.sourcePriorityScore,
      sourceCategory: source.category,
      discipline: source.discipline,
      promotionOrPublisher: source.promotionOrPublisher,
    }
  }

  if ((longContext || staleRepost || trainingFootage || score < 62) && !boosted) {
    return {
      treatment: longContext || staleRepost || trainingFootage || score >= 45 ? 'held' : 'rejected',
      reasons: reasons.length ? reasons : ['Held for operator review by RB Combat source filters.'],
      sourcePriority: source.priority,
      sourcePriorityScore: source.sourcePriorityScore,
      sourceCategory: source.category,
      discipline: source.discipline,
      promotionOrPublisher: source.promotionOrPublisher,
    }
  }

  return {
    treatment: 'advanced',
    reasons: reasons.length ? reasons : ['Advanced by RB Combat Phase 1 source filters.'],
    sourcePriority: source.priority,
    sourcePriorityScore: source.sourcePriorityScore,
    sourceCategory: source.category,
    discipline: source.discipline,
    promotionOrPublisher: source.promotionOrPublisher,
  }
}
