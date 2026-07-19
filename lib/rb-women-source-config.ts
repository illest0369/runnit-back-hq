export const RB_WOMEN_CHANNEL_ID = 'a1000000-0000-0000-0000-000000000004'

export type RBWomenSourcePriority = 'core' | 'useful' | 'experimental' | 'disabled_noisy'
export type RBWomenSourceTreatment = 'advanced' | 'held' | 'rejected'

export type RBWomenPhase1Source = {
  channelKey: string
  displayName: string
  priority: RBWomenSourcePriority
  sourcePriorityScore: number
  active: boolean
  usefulFor: string[]
  noisyIf: string[]
  rejectIf: string[]
  boostIf: string[]
}

export type RBWomenSourceCandidateFilter = {
  treatment: RBWomenSourceTreatment
  reasons: string[]
  sourcePriority: RBWomenSourcePriority | 'unknown'
  sourcePriorityScore: number
}

export const RB_WOMEN_PHASE1_SOURCES: RBWomenPhase1Source[] = [
  {
    channelKey: 'wnba_official',
    displayName: 'WNBA',
    priority: 'core',
    sourcePriorityScore: 96,
    active: true,
    usefulFor: ['debate', 'player_personality', 'elite_basketball'],
    noisyIf: ['generic schedule announcement', 'transaction-only update'],
    rejectIf: ['generic league announcement without player angle', 'broadcast schedule only'],
    boostIf: ['recognizable player', 'foul or officiating debate', 'strong quote', 'visual basketball moment'],
  },
  {
    channelKey: 'unrivaled_basketball',
    displayName: 'Unrivaled Basketball',
    priority: 'core',
    sourcePriorityScore: 95,
    active: true,
    usefulFor: ['debate', 'player_personality', 'elite_basketball'],
    noisyIf: ['ticket promo', 'sponsor activation', 'schedule announcement'],
    rejectIf: ['generic league announcement without player angle', 'merchandise promo only'],
    boostIf: ['recognizable player', 'player quote', 'matchup tension', 'press conference reaction'],
  },
  {
    channelKey: 'indiana_fever',
    displayName: 'Indiana Fever',
    priority: 'core',
    sourcePriorityScore: 93,
    active: true,
    usefulFor: ['debate', 'player_personality', 'elite_basketball'],
    noisyIf: ['ticket promo', 'community appearance without story', 'routine practice footage'],
    rejectIf: ['sponsor ad only', 'schedule announcement only'],
    boostIf: ['Caitlin Clark', 'Aliyah Boston', 'foul debate', 'rookie-veteran matchup'],
  },
  {
    channelKey: 'dallas_wings',
    displayName: 'Dallas Wings',
    priority: 'core',
    sourcePriorityScore: 91,
    active: true,
    usefulFor: ['debate', 'player_personality', 'elite_basketball'],
    noisyIf: ['ticket promo', 'community appearance without story', 'routine practice footage'],
    rejectIf: ['sponsor ad only', 'schedule announcement only'],
    boostIf: ['Paige Bueckers', 'Arike Ogunbowale', 'player quote', 'major highlight'],
  },
  {
    channelKey: 'minnesota_lynx',
    displayName: 'Minnesota Lynx',
    priority: 'core',
    sourcePriorityScore: 90,
    active: true,
    usefulFor: ['debate', 'player_personality', 'elite_basketball'],
    noisyIf: ['ticket promo', 'community appearance without story', 'routine practice footage'],
    rejectIf: ['sponsor ad only', 'schedule announcement only'],
    boostIf: ['Napheesa Collier', 'Kayla McBride', 'veteran-vs-rookie angle', 'press conference reaction'],
  },
  {
    channelKey: 'las_vegas_aces',
    displayName: 'Las Vegas Aces',
    priority: 'core',
    sourcePriorityScore: 92,
    active: true,
    usefulFor: ['debate', 'player_personality', 'elite_basketball'],
    noisyIf: ['ticket promo', 'sponsor activation', 'routine practice footage'],
    rejectIf: ['merchandise promo only', 'schedule announcement only'],
    boostIf: ['A\'ja Wilson', 'Kelsey Plum', 'officiating debate', 'championship quote'],
  },
  {
    channelKey: 'new_york_liberty',
    displayName: 'New York Liberty',
    priority: 'core',
    sourcePriorityScore: 91,
    active: true,
    usefulFor: ['debate', 'player_personality', 'elite_basketball'],
    noisyIf: ['ticket promo', 'sponsor activation', 'routine practice footage'],
    rejectIf: ['merchandise promo only', 'schedule announcement only'],
    boostIf: ['Sabrina Ionescu', 'Breanna Stewart', 'matchup tension', 'media narrative'],
  },
  {
    channelKey: 'chicago_sky',
    displayName: 'Chicago Sky',
    priority: 'core',
    sourcePriorityScore: 90,
    active: true,
    usefulFor: ['debate', 'player_personality', 'elite_basketball'],
    noisyIf: ['ticket promo', 'community appearance without story', 'routine practice footage'],
    rejectIf: ['sponsor ad only', 'schedule announcement only'],
    boostIf: ['Angel Reese', 'Kamilla Cardoso', 'player callout', 'foul debate'],
  },
  {
    channelKey: 'los_angeles_sparks',
    displayName: 'Los Angeles Sparks',
    priority: 'useful',
    sourcePriorityScore: 88,
    active: true,
    usefulFor: ['debate', 'player_personality', 'elite_basketball'],
    noisyIf: ['ticket promo', 'community appearance without story', 'routine practice footage'],
    rejectIf: ['sponsor ad only', 'schedule announcement only'],
    boostIf: ['Cameron Brink', 'Kelsey Plum', 'player quote', 'major highlight'],
  },
  {
    channelKey: 'phoenix_mercury',
    displayName: 'Phoenix Mercury',
    priority: 'useful',
    sourcePriorityScore: 88,
    active: true,
    usefulFor: ['debate', 'player_personality', 'elite_basketball'],
    noisyIf: ['ticket promo', 'community appearance without story', 'routine practice footage'],
    rejectIf: ['sponsor ad only', 'schedule announcement only'],
    boostIf: ['Kahleah Copper', 'Diana Taurasi', 'veteran-vs-rookie angle', 'press conference reaction'],
  },
  {
    channelKey: 'seattle_storm',
    displayName: 'Seattle Storm',
    priority: 'useful',
    sourcePriorityScore: 88,
    active: true,
    usefulFor: ['debate', 'player_personality', 'elite_basketball'],
    noisyIf: ['ticket promo', 'community appearance without story', 'routine practice footage'],
    rejectIf: ['sponsor ad only', 'schedule announcement only'],
    boostIf: ['Nneka Ogwumike', 'Skylar Diggins', 'player quote', 'major highlight'],
  },
  {
    channelKey: 'atlanta_dream',
    displayName: 'Atlanta Dream',
    priority: 'useful',
    sourcePriorityScore: 88,
    active: true,
    usefulFor: ['debate', 'player_personality', 'elite_basketball'],
    noisyIf: ['ticket promo', 'community appearance without story', 'routine practice footage'],
    rejectIf: ['sponsor ad only', 'schedule announcement only'],
    boostIf: ['Rhyne Howard', 'Allisha Gray', 'matchup tension', 'major highlight'],
  },
  {
    channelKey: 'just_womens_sports',
    displayName: 'Just Women\'s Sports',
    priority: 'core',
    sourcePriorityScore: 94,
    active: true,
    usefulFor: ['debate', 'player_personality', 'college_basketball', 'women_sports_expansion'],
    noisyIf: ['broad empowerment framing', 'context-heavy explainer'],
    rejectIf: ['generic women sports roundup without a person-centered hook'],
    boostIf: ['athlete quote', 'culture clip', 'debate framing', 'searchable player topic'],
  },
  {
    channelKey: 'wnba_on_nbc',
    displayName: 'WNBA on NBC',
    priority: 'useful',
    sourcePriorityScore: 86,
    active: true,
    usefulFor: ['debate', 'media_narrative', 'elite_basketball'],
    noisyIf: ['broadcast schedule only', 'rights announcement without player hook'],
    rejectIf: ['generic schedule announcement without a player angle'],
    boostIf: ['media narrative', 'recognizable player', 'strong quote', 'major highlight'],
  },
  {
    channelKey: 'tnt_sports_us',
    displayName: 'TNT Sports US',
    priority: 'useful',
    sourcePriorityScore: 84,
    active: true,
    usefulFor: ['debate', 'media_narrative', 'elite_basketball'],
    noisyIf: ['broadcast schedule only', 'studio promo only'],
    rejectIf: ['sponsor ad only', 'generic broadcast announcement without player angle'],
    boostIf: ['player callout', 'officiating debate', 'strong quote', 'major highlight'],
  },
  {
    channelKey: 'all_womens_sports_network',
    displayName: 'All Women\'s Sports Network',
    priority: 'useful',
    sourcePriorityScore: 84,
    active: true,
    usefulFor: ['player_personality', 'women_sports_expansion', 'media_narrative'],
    noisyIf: ['broad roundup without a person-centered hook', 'long livestream without timestamps'],
    rejectIf: ['requires long outside context', 'generic empowerment framing without a story'],
    boostIf: ['athlete quote', 'personality/culture moment', 'media narrative', 'press conference reaction'],
  },
  {
    channelKey: 'the_womens_game',
    displayName: 'The Women\'s Game',
    priority: 'useful',
    sourcePriorityScore: 82,
    active: true,
    usefulFor: ['player_personality', 'women_sports_expansion'],
    noisyIf: ['long panel setup', 'match preview without player tension'],
    rejectIf: ['requires long outside context'],
    boostIf: ['athlete-centered soccer story', 'player reaction', 'clear quote'],
  },
  {
    channelKey: 'cbs_sports_w_golazo',
    displayName: 'CBS Sports W Golazo',
    priority: 'useful',
    sourcePriorityScore: 78,
    active: true,
    usefulFor: ['women_sports_expansion', 'player_personality'],
    noisyIf: ['studio recap without a clip moment', 'broad tournament explainer'],
    rejectIf: ['no recognizable athlete or human angle'],
    boostIf: ['USWNT or NWSL player moment', 'coverage debate', 'matchup tension'],
  },
  {
    channelKey: 'nwsl_official',
    displayName: 'NWSL',
    priority: 'experimental',
    sourcePriorityScore: 72,
    active: true,
    usefulFor: ['women_sports_expansion', 'elite_basketball'],
    noisyIf: ['generic highlight package', 'standings or schedule update'],
    rejectIf: ['no player personality, conflict, or strong visual'],
    boostIf: ['star player', 'goal celebration', 'fan culture', 'media narrative'],
  },
  {
    channelKey: 'espn_w',
    displayName: 'espnW',
    priority: 'disabled_noisy',
    sourcePriorityScore: 0,
    active: false,
    usefulFor: [],
    noisyIf: ['feed unavailable'],
    rejectIf: ['feed returns 404'],
    boostIf: [],
  },
  {
    channelKey: 'ncaa_womens_basketball',
    displayName: 'NCAA Women\'s Basketball',
    priority: 'disabled_noisy',
    sourcePriorityScore: 0,
    active: false,
    usefulFor: ['college_basketball'],
    noisyIf: ['stale feed', 'low-quality for daily plan'],
    rejectIf: ['latest entries are stale'],
    boostIf: ['tournament emotion', 'recognizable player quote'],
  },
]

const GENERIC_NEWS_PATTERNS = [
  'announces',
  'announced',
  'announcement',
  'schedule',
  'broadcast',
  'tickets',
  'ticket',
  'merch',
  'merchandise',
  'sponsor',
  'sponsored',
  'presented by',
  'regular season',
]

const LONG_CONTEXT_PATTERNS = [
  'explained',
  'to understand',
  'background',
  'cba',
  'salary cap',
  'requires context',
  'livestream',
  'live stream',
  'full game',
  'full episode',
  'without timestamps',
]

const LOW_STORY_PATTERNS = [
  'community appearance',
  'community event',
  'meet and greet',
  'practice',
  'shootaround',
  'behind the scenes',
  'media day photos',
]

const BOOST_PATTERNS = [
  'caitlin clark',
  'angel reese',
  'a\'ja wilson',
  'aja wilson',
  'paige bueckers',
  'foul',
  'officiating',
  'whistle',
  'quote',
  'called out',
  'callout',
  'press conference',
  'reaction',
  'highlight',
  'media narrative',
  'personality',
  'culture',
  'vs',
  'matchup',
  'rookie',
  'veteran',
]

function normalize(value: string | null | undefined): string {
  return value?.toLowerCase().replace(/\s+/g, ' ').trim() ?? ''
}

function includesAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern))
}

export function rbWomenPhase1SourceForKey(channelKey: string | null | undefined): RBWomenPhase1Source | null {
  const key = normalize(channelKey).replace(/[^a-z0-9_]+/g, '')
  return RB_WOMEN_PHASE1_SOURCES.find((source) => source.channelKey === key) ?? null
}

export function rbWomenPhase1ActiveSources(): RBWomenPhase1Source[] {
  return RB_WOMEN_PHASE1_SOURCES.filter((source) => source.active)
}

export function rbWomenPhase1NoisySources(): RBWomenPhase1Source[] {
  return RB_WOMEN_PHASE1_SOURCES.filter((source) => !source.active || source.priority === 'disabled_noisy')
}

export function classifyRBWomenSourceCandidate(input: {
  channelKey?: string | null
  title?: string | null
  description?: string | null
  score?: number | null
}): RBWomenSourceCandidateFilter {
  const source = rbWomenPhase1SourceForKey(input.channelKey)
  const text = normalize(`${input.title ?? ''} ${input.description ?? ''}`)
  const score = typeof input.score === 'number' && Number.isFinite(input.score) ? input.score : 0
  const reasons: string[] = []

  if (!source) {
    return {
      treatment: score >= 65 ? 'held' : 'rejected',
      reasons: ['RB Women source is not in the Phase 1 curated feed set.'],
      sourcePriority: 'unknown',
      sourcePriorityScore: 0,
    }
  }

  if (!source.active) {
    return {
      treatment: 'rejected',
      reasons: [`${source.displayName} is disabled/noisy for RB Women Phase 1.`],
      sourcePriority: source.priority,
      sourcePriorityScore: source.sourcePriorityScore,
    }
  }

  const genericNews = includesAny(text, GENERIC_NEWS_PATTERNS)
  const longContext = includesAny(text, LONG_CONTEXT_PATTERNS)
  const lowStory = includesAny(text, LOW_STORY_PATTERNS)
  const boosted = includesAny(text, BOOST_PATTERNS)

  if (genericNews && score < 65) reasons.push('Reject/hold: generic announcement without a person-centered hook.')
  if (longContext) reasons.push('Hold: requires too much outside context for a fast TikTok open.')
  if (lowStory && !boosted) reasons.push('Reject/hold: routine appearance or practice footage without a story.')
  if (boosted) reasons.push('Boost: player/debate/matchup signal fits RB Women priorities.')
  if (source.priority === 'experimental') reasons.push('Experimental source: require stronger visual, player, or culture angle.')

  if ((genericNews || lowStory) && !boosted) {
    return {
      treatment: 'rejected',
      reasons: reasons.length ? reasons : ['Rejected by RB Women generic-news filter.'],
      sourcePriority: source.priority,
      sourcePriorityScore: source.sourcePriorityScore,
    }
  }

  if (longContext || source.priority === 'experimental' || score < 65) {
    return {
      treatment: score >= 50 ? 'held' : 'rejected',
      reasons: reasons.length ? reasons : ['Held for operator review by RB Women source filters.'],
      sourcePriority: source.priority,
      sourcePriorityScore: source.sourcePriorityScore,
    }
  }

  return {
    treatment: 'advanced',
    reasons: reasons.length ? reasons : ['Advanced by RB Women Phase 1 source filters.'],
    sourcePriority: source.priority,
    sourcePriorityScore: source.sourcePriorityScore,
  }
}
