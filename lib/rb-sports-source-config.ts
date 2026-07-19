export const RB_SPORTS_CHANNEL_ID = 'a1000000-0000-0000-0000-000000000001'

export type RBSportsSourcePriority = 'core' | 'useful' | 'experimental' | 'disabled_noisy'
export type RBSportsSourceTreatment = 'advanced' | 'held' | 'rejected'
export type RBSportsSourceCategory =
  | 'official_league_highlights_news'
  | 'official_team_channel'
  | 'trusted_broadcast_highlight'
  | 'trusted_sports_media_analysis'
  | 'discovery_fan_reaction'
  | 'disabled_noise'

export type RBSportsPhase1Source = {
  channelKey: string
  displayName: string
  category: RBSportsSourceCategory
  priority: RBSportsSourcePriority
  sourcePriorityScore: number
  active: boolean
  usefulFor: string[]
  noisyIf: string[]
  rejectIf: string[]
  boostIf: string[]
}

export type RBSportsSourceCandidateFilter = {
  treatment: RBSportsSourceTreatment
  reasons: string[]
  sourcePriority: RBSportsSourcePriority | 'unknown'
  sourcePriorityScore: number
  sourceCategory: RBSportsSourceCategory | 'unknown'
}

export const RB_SPORTS_PHASE1_SOURCES: RBSportsPhase1Source[] = [
  {
    channelKey: 'nba_official',
    displayName: 'NBA',
    category: 'official_league_highlights_news',
    priority: 'core',
    sourcePriorityScore: 96,
    active: true,
    usefulFor: ['clutch_plays', 'rivalries', 'playoff_stakes', 'bad_calls', 'player_reactions'],
    noisyIf: ['long highlight dump', 'generic top plays compilation', 'schedule announcement'],
    rejectIf: ['generic promo without player or team angle', 'full game without timestamp'],
    boostIf: ['game winner', 'buzzer beater', 'playoff', 'rivalry', 'ejection', 'press conference'],
  },
  {
    channelKey: 'nfl_official',
    displayName: 'NFL',
    category: 'official_league_highlights_news',
    priority: 'core',
    sourcePriorityScore: 96,
    active: true,
    usefulFor: ['clutch_plays', 'bad_calls', 'rivalries', 'injuries_returns', 'coach_player_pressers'],
    noisyIf: ['schedule release', 'generic micd up compilation', 'long game recap'],
    rejectIf: ['ticket promo only', 'full game without timestamp'],
    boostIf: ['game winner', 'interception', 'controversial flag', 'playoff', 'rivalry', 'injury return'],
  },
  {
    channelKey: 'mlb_official',
    displayName: 'MLB',
    category: 'official_league_highlights_news',
    priority: 'core',
    sourcePriorityScore: 92,
    active: true,
    usefulFor: ['walk_offs', 'rivalries', 'bad_calls', 'trades_roster_movement', 'playoff_stakes'],
    noisyIf: ['full game highlights dump', 'schedule filler', 'generic stat ranking'],
    rejectIf: ['condensed game without a named moment', 'ticket promo only'],
    boostIf: ['walk-off', 'ejection', 'home run', 'trade', 'injury return', 'playoff'],
  },
  {
    channelKey: 'nhl_official',
    displayName: 'NHL',
    category: 'official_league_highlights_news',
    priority: 'core',
    sourcePriorityScore: 90,
    active: true,
    usefulFor: ['overtime_winners', 'rivalries', 'bad_calls', 'playoff_stakes', 'player_reactions'],
    noisyIf: ['long highlight dump', 'generic top saves', 'schedule filler'],
    rejectIf: ['full game without timestamp', 'generic promo without player or team angle'],
    boostIf: ['overtime', 'game winner', 'fight', 'controversial call', 'playoff', 'rivalry'],
  },
  {
    channelKey: 'espn_main',
    displayName: 'ESPN',
    category: 'trusted_sports_media_analysis',
    priority: 'useful',
    sourcePriorityScore: 86,
    active: true,
    usefulFor: ['breaking_reaction', 'trades_roster_movement', 'injuries_returns', 'fan_debate_moments'],
    noisyIf: ['broad studio segment', 'generic rankings', 'long podcast without timestamps'],
    rejectIf: ['betting-only content', 'fantasy-only content', 'schedule filler'],
    boostIf: ['breaking', 'trade', 'injury', 'suspension', 'calls out', 'heated debate'],
  },
  {
    channelKey: 'bleacher_report',
    displayName: 'Bleacher Report',
    category: 'trusted_sports_media_analysis',
    priority: 'useful',
    sourcePriorityScore: 84,
    active: true,
    usefulFor: ['fan_debate_moments', 'breaking_reaction', 'rivalries', 'highlight_evidence'],
    noisyIf: ['low-context highlight dump', 'evergreen debate clip', 'sponsor activation'],
    rejectIf: ['generic merch promo', 'requires long outside context'],
    boostIf: ['reaction', 'calls out', 'trade', 'rivalry', 'clutch', 'fans split'],
  },
  {
    channelKey: 'house_of_highlights',
    displayName: 'House of Highlights',
    category: 'trusted_broadcast_highlight',
    priority: 'useful',
    sourcePriorityScore: 82,
    active: true,
    usefulFor: ['clutch_plays', 'fan_debate_moments', 'highlight_evidence', 'rivalries'],
    noisyIf: ['low-context highlight dump', 'challenge video', 'creator event'],
    rejectIf: ['no player, team, quote, or game context'],
    boostIf: ['clutch', 'game winner', 'reaction', 'bad call', 'rivalry', 'went off'],
  },
  {
    channelKey: 'cbs_sports',
    displayName: 'CBS Sports',
    category: 'trusted_sports_media_analysis',
    priority: 'useful',
    sourcePriorityScore: 82,
    active: true,
    usefulFor: ['breaking_reaction', 'coach_player_pressers', 'trades_roster_movement', 'playoff_stakes'],
    noisyIf: ['long panel segment', 'generic rankings', 'betting odds'],
    rejectIf: ['sportsbook or fantasy-only segment', 'schedule filler only'],
    boostIf: ['breaking', 'trade', 'press conference', 'playoff', 'heated reaction', 'injury'],
  },
  {
    channelKey: 'nbc_sports',
    displayName: 'NBC Sports',
    category: 'trusted_broadcast_highlight',
    priority: 'useful',
    sourcePriorityScore: 80,
    active: true,
    usefulFor: ['trusted_highlights', 'coach_player_pressers', 'injuries_returns', 'playoff_stakes'],
    noisyIf: ['long show segment', 'broad league explainer', 'schedule filler'],
    rejectIf: ['full episode without timestamp', 'generic show promo'],
    boostIf: ['highlight', 'reaction', 'press conference', 'playoff', 'bad call', 'injury'],
  },
  {
    channelKey: 'los_angeles_lakers',
    displayName: 'Los Angeles Lakers',
    category: 'official_team_channel',
    priority: 'useful',
    sourcePriorityScore: 76,
    active: true,
    usefulFor: ['coach_player_pressers', 'star_pressure', 'injuries_returns', 'fan_debate_moments'],
    noisyIf: ['community appearance', 'practice footage', 'ticket promo'],
    rejectIf: ['sponsor ad only', 'schedule announcement only'],
    boostIf: ['LeBron James', 'Luka Doncic', 'press conference', 'injury return', 'heated quote'],
  },
  {
    channelKey: 'kansas_city_chiefs',
    displayName: 'Kansas City Chiefs',
    category: 'official_team_channel',
    priority: 'useful',
    sourcePriorityScore: 76,
    active: true,
    usefulFor: ['coach_player_pressers', 'rivalries', 'injuries_returns', 'playoff_stakes'],
    noisyIf: ['community appearance', 'practice footage', 'long podcast without timestamps'],
    rejectIf: ['sponsor ad only', 'schedule announcement only'],
    boostIf: ['Patrick Mahomes', 'Andy Reid', 'press conference', 'injury return', 'playoff'],
  },
  {
    channelKey: 'dallas_cowboys',
    displayName: 'Dallas Cowboys',
    category: 'official_team_channel',
    priority: 'useful',
    sourcePriorityScore: 74,
    active: true,
    usefulFor: ['coach_player_pressers', 'fan_debate_moments', 'rivalries', 'roster_movement'],
    noisyIf: ['long podcast without timestamps', 'practice footage', 'community appearance'],
    rejectIf: ['sponsor ad only', 'schedule announcement only'],
    boostIf: ['Dak Prescott', 'Micah Parsons', 'Jerry Jones', 'press conference', 'rivalry'],
  },
  {
    channelKey: 'sports_fan_reactions_discovery',
    displayName: 'Sports Fan Reactions Discovery',
    category: 'discovery_fan_reaction',
    priority: 'experimental',
    sourcePriorityScore: 35,
    active: false,
    usefulFor: ['fan_debate_moments'],
    noisyIf: ['low-context reaction', 'creator-first framing', 'requires outside context'],
    rejectIf: ['no player, team, game, quote, or visible sports moment'],
    boostIf: ['recognizable fan debate around a current game or call'],
  },
  {
    channelKey: 'betting_fantasy_watchlist',
    displayName: 'Betting/Fantasy Watchlist',
    category: 'disabled_noise',
    priority: 'disabled_noisy',
    sourcePriorityScore: 0,
    active: false,
    usefulFor: [],
    noisyIf: ['odds', 'parlay', 'start-sit', 'waiver wire', 'props'],
    rejectIf: ['betting-only content', 'fantasy-only content'],
    boostIf: [],
  },
  {
    channelKey: 'longform_podcast_watchlist',
    displayName: 'Longform Podcast Watchlist',
    category: 'disabled_noise',
    priority: 'disabled_noisy',
    sourcePriorityScore: 0,
    active: false,
    usefulFor: [],
    noisyIf: ['full episode', 'long podcast without timestamps', 'evergreen debate'],
    rejectIf: ['no timestamped quote or clear short-form payoff'],
    boostIf: [],
  },
]

const BETTING_FANTASY_PATTERNS = [
  'betting',
  'sportsbook',
  'odds',
  'parlay',
  'prop bet',
  'props',
  'spread',
  'over under',
  'draftkings',
  'fanduel',
  'fantasy',
  'waiver',
  'start sit',
  'start/sit',
  'sleeper pick',
]

const FILLER_PATTERNS = [
  'schedule',
  'power rankings',
  'ranking',
  'rankings',
  'tier list',
  'mock draft',
  'ticket',
  'tickets',
  'merch',
  'sponsor',
  'sponsored',
  'presented by',
]

const LONG_CONTEXT_PATTERNS = [
  'full episode',
  'podcast',
  'livestream',
  'live stream',
  'full game',
  'condensed game',
  'without timestamps',
  'evergreen',
  'explained',
]

const LOW_CONTEXT_HIGHLIGHT_PATTERNS = [
  'top 10',
  'best plays',
  'highlight dump',
  'compilation',
  'all highlights',
]

const BOOST_PATTERNS = [
  'breaking',
  'trade',
  'traded',
  'free agency',
  'roster',
  'injury',
  'returns',
  'suspension',
  'clutch',
  'game winner',
  'buzzer beater',
  'walk-off',
  'overtime',
  'bad call',
  'controversial call',
  'flag',
  'ejected',
  'ejection',
  'rivalry',
  'playoff',
  'finals',
  'press conference',
  'calls out',
  'called out',
  'quote',
  'reacts',
  'reaction',
  'fans split',
]

function normalize(value: string | null | undefined): string {
  return value?.toLowerCase().replace(/\s+/g, ' ').trim() ?? ''
}

function includesAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern))
}

export function rbSportsPhase1SourceForKey(channelKey: string | null | undefined): RBSportsPhase1Source | null {
  const key = normalize(channelKey).replace(/[^a-z0-9_]+/g, '')
  return RB_SPORTS_PHASE1_SOURCES.find((source) => source.channelKey === key) ?? null
}

export function rbSportsPhase1ActiveSources(): RBSportsPhase1Source[] {
  return RB_SPORTS_PHASE1_SOURCES.filter((source) => source.active)
}

export function rbSportsPhase1NoisySources(): RBSportsPhase1Source[] {
  return RB_SPORTS_PHASE1_SOURCES.filter((source) => !source.active || source.priority === 'disabled_noisy')
}

export function classifyRBSportsSourceCandidate(input: {
  channelKey?: string | null
  title?: string | null
  description?: string | null
  score?: number | null
}): RBSportsSourceCandidateFilter {
  const source = rbSportsPhase1SourceForKey(input.channelKey)
  const text = normalize(`${input.title ?? ''} ${input.description ?? ''}`)
  const score = typeof input.score === 'number' && Number.isFinite(input.score) ? input.score : 0
  const reasons: string[] = []

  if (!source) {
    return {
      treatment: score >= 70 ? 'held' : 'rejected',
      reasons: ['RB Sports source is not in the Phase 1 curated feed set.'],
      sourcePriority: 'unknown',
      sourcePriorityScore: 0,
      sourceCategory: 'unknown',
    }
  }

  if (!source.active) {
    return {
      treatment: 'rejected',
      reasons: [`${source.displayName} is disabled/noisy for RB Sports Phase 1.`],
      sourcePriority: source.priority,
      sourcePriorityScore: source.sourcePriorityScore,
      sourceCategory: source.category,
    }
  }

  const bettingFantasy = includesAny(text, BETTING_FANTASY_PATTERNS)
  const filler = includesAny(text, FILLER_PATTERNS)
  const longContext = includesAny(text, LONG_CONTEXT_PATTERNS)
  const lowContextHighlight = includesAny(text, LOW_CONTEXT_HIGHLIGHT_PATTERNS)
  const boosted = includesAny(text, BOOST_PATTERNS)

  if (bettingFantasy) reasons.push('Reject: betting/fantasy-only content is out of scope for RB Sports Phase 1.')
  if (filler && !boosted) reasons.push('Reject/hold: schedule, ranking, merch, or sponsor filler without a current clip angle.')
  if (longContext && !boosted) reasons.push('Hold: long-form item needs timestamps or a clear short-form payoff.')
  if (lowContextHighlight && !boosted) reasons.push('Hold: low-context highlight dump without a named player/team moment.')
  if (boosted) reasons.push('Boost: current sports-news/highlight signal fits RB Sports priorities.')
  if (source.category === 'official_team_channel') reasons.push('Team source: require player, presser, rivalry, injury, or roster angle.')

  if (bettingFantasy || (filler && !boosted)) {
    return {
      treatment: 'rejected',
      reasons: reasons.length ? reasons : ['Rejected by RB Sports source filters.'],
      sourcePriority: source.priority,
      sourcePriorityScore: source.sourcePriorityScore,
      sourceCategory: source.category,
    }
  }

  if ((longContext || lowContextHighlight || score < 65) && !boosted) {
    return {
      treatment: score >= 50 ? 'held' : 'rejected',
      reasons: reasons.length ? reasons : ['Held for operator review by RB Sports source filters.'],
      sourcePriority: source.priority,
      sourcePriorityScore: source.sourcePriorityScore,
      sourceCategory: source.category,
    }
  }

  return {
    treatment: 'advanced',
    reasons: reasons.length ? reasons : ['Advanced by RB Sports Phase 1 source filters.'],
    sourcePriority: source.priority,
    sourcePriorityScore: source.sourcePriorityScore,
    sourceCategory: source.category,
  }
}
