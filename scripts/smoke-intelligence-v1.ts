import assert from 'node:assert/strict'

import {
  buildDailyContentPlan,
  buildRBHQIntelligenceV1,
  getRBHQIntelligenceV1,
  getStoredRBHQIntelligenceV1,
  type SourceCandidateSummary,
  withStoredRBHQIntelligenceV1,
} from '../lib/intelligence-v1'

const sportsClip = {
  id: 'sports-smoke',
  channel_id: 'a1000000-0000-0000-0000-000000000001',
  title: 'Breaking trade reaction after clutch playoff upset',
  hook: 'Fans are losing it after the final play',
  source_name: 'ESPN',
  source_type: 'youtube_rss',
  sport: 'basketball',
  league: 'NBA',
  duration_seconds: 18,
  ai_score: 78,
  virality_score: 84,
  hook_strength: 82,
  published_at: new Date().toISOString(),
  moderation_notes: [],
  risk_flags: [],
}

const arenaClip = {
  id: 'arena-smoke',
  channel_id: 'a1000000-0000-0000-0000-000000000002',
  title: 'Valorant clutch reaction goes viral after patch reveal',
  hook: 'This lobby completely lost it',
  source_name: 'VALORANT Champions Tour',
  source_type: 'youtube_rss',
  sport: 'esports',
  league: 'Valorant',
  duration_seconds: 21,
  ai_score: 74,
  virality_score: 80,
  hook_strength: 79,
  published_at: new Date().toISOString(),
  moderation_notes: [],
  risk_flags: [],
}

const sports = buildRBHQIntelligenceV1(sportsClip)
const arena = buildRBHQIntelligenceV1(arenaClip)
const neutralSourceCandidate = buildRBHQIntelligenceV1({
  title: 'One hour of offseason workout clips',
  source_name: 'Neutral Source',
  source_type: 'youtube_rss',
  created_at: new Date().toISOString(),
})
const womenTournamentCandidate = buildRBHQIntelligenceV1({
  channel_id: 'a1000000-0000-0000-0000-000000000004',
  title: 'NCAA tournament reveal sets up a rivalry rematch',
  source_name: 'NCAA Women\'s Basketball',
  source_type: 'youtube_rss',
  published_at: new Date().toISOString(),
})
const futbolTournamentCandidate = buildRBHQIntelligenceV1({
  channel_id: 'a1000000-0000-0000-0000-000000000005',
  title: 'UEFA tournament reveal sends fans into heated reaction',
  source_name: 'UEFA',
  source_type: 'youtube_rss',
  published_at: new Date().toISOString(),
})
const cfbSourceCandidate = buildRBHQIntelligenceV1({
  channel_id: '93484eef-06d8-46fd-bce2-ce252422c58e',
  title: 'SEC rivalry reaction after a clutch upset',
  source_name: 'SEC',
  source_type: 'youtube_rss',
  published_at: new Date().toISOString(),
})
const combatBoxingCandidate = buildRBHQIntelligenceV1({
  channel_id: 'a1000000-0000-0000-0000-000000000003',
  title: 'DAZN Boxing faceoff turns heated before fight night',
  source_name: 'DAZN Boxing',
  source_type: 'youtube_rss',
  published_at: new Date().toISOString(),
})
const staleSourceCandidate = buildRBHQIntelligenceV1({
  channel_id: 'a1000000-0000-0000-0000-000000000002',
  title: 'Major tournament grand final reaction',
  source_name: 'Call of Duty League',
  source_type: 'youtube_rss',
  published_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
})
const highScoreEvergreenCandidate = {
  id: 'high-evergreen-smoke',
  channel_id: 'a1000000-0000-0000-0000-000000000001',
  title: 'All-time championship documentary feature',
  source_name: 'NBA',
  source_type: 'youtube_rss',
  ai_score: 95,
  virality_score: 94,
  hook_strength: 90,
  published_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  moderation_notes: [],
  risk_flags: [],
}
const highScoreEvergreen = buildRBHQIntelligenceV1(highScoreEvergreenCandidate)
const rbWomenCaitlinFoulDebate = buildRBHQIntelligenceV1({
  id: 'rb-women-caitlin-foul-debate',
  channel_id: 'a1000000-0000-0000-0000-000000000004',
  title: 'Caitlin Clark acting foul debate splits WNBA fans',
  hook: 'Caitlin Clark sold the contact and the whistle changed everything',
  source_name: 'WNBA',
  source_type: 'youtube_rss',
  sport: 'basketball',
  league: 'WNBA',
  duration_seconds: 20,
  ai_score: 70,
  virality_score: 70,
  hook_strength: 70,
  published_at: new Date().toISOString(),
  text: 'Caitlin Clark acting foul debate after a controversial whistle. Fans are split on whether the officiating was fair or if she sold the contact.',
  moderation_notes: [],
  risk_flags: [],
})
const rbWomenKaylaOliviaMatchup = buildRBHQIntelligenceV1({
  id: 'rb-women-kayla-olivia-matchup',
  channel_id: 'a1000000-0000-0000-0000-000000000004',
  title: 'Kayla McBride vs Olivia Miles matchup gets physical late',
  hook: 'Kayla McBride and Olivia Miles turned this matchup into a real test',
  source_name: 'WNBA',
  source_type: 'youtube_rss',
  sport: 'basketball',
  league: 'WNBA',
  duration_seconds: 24,
  ai_score: 65,
  virality_score: 65,
  hook_strength: 65,
  published_at: new Date().toISOString(),
  text: 'Kayla McBride veteran guard matchup versus Olivia Miles rookie pressure with defense, bucket trading, and a strong visual late-game basketball moment.',
  moderation_notes: [],
  risk_flags: [],
})
const rbWomenPaigeRepresentationQuote = buildRBHQIntelligenceV1({
  id: 'rb-women-paige-representation-quote',
  channel_id: 'a1000000-0000-0000-0000-000000000004',
  title: 'Paige Bueckers representation quote lands with fans',
  hook: 'Paige Bueckers said the quiet part in the best way',
  source_name: 'NCAA Women\'s Basketball',
  source_type: 'youtube_rss',
  sport: 'basketball',
  league: 'NCAA WBB',
  duration_seconds: 18,
  ai_score: 65,
  virality_score: 65,
  hook_strength: 65,
  published_at: new Date().toISOString(),
  text: 'Paige Bueckers gave a representation quote about young girls seeing themselves in college basketball and fans reacted to the personality and meaning.',
  moderation_notes: [],
  risk_flags: [],
})
const rbWomenGenericAnnouncement = buildRBHQIntelligenceV1({
  id: 'rb-women-generic-announcement',
  channel_id: 'a1000000-0000-0000-0000-000000000004',
  title: 'WNBA announces updated regular season broadcast schedule',
  hook: 'The league announced the new schedule',
  source_name: 'WNBA',
  source_type: 'youtube_rss',
  sport: 'basketball',
  league: 'WNBA',
  duration_seconds: 28,
  ai_score: 70,
  virality_score: 60,
  hook_strength: 50,
  published_at: new Date().toISOString(),
  text: 'The league announced schedule updates, broadcast windows, ticket information, and general regular season details.',
  moderation_notes: [],
  risk_flags: [],
})
const rbWomenContextHeavy = buildRBHQIntelligenceV1({
  id: 'rb-women-context-heavy',
  channel_id: 'a1000000-0000-0000-0000-000000000004',
  title: 'Caitlin Clark treatment debate needs a long CBA roster explainer',
  hook: 'Caitlin Clark reaction needs the full rule context',
  source_name: 'WNBA',
  source_type: 'youtube_rss',
  sport: 'basketball',
  league: 'WNBA',
  duration_seconds: 45,
  ai_score: 68,
  virality_score: 55,
  hook_strength: 45,
  published_at: new Date().toISOString(),
  text: 'Caitlin Clark is part of the treatment debate, but to understand why this matters, viewers need the prior CBA dispute, roster hardship rule, salary cap timeline, and months of background before the actual quote makes sense.',
  moderation_notes: [],
  risk_flags: [],
})
const rbWomenNonWnbaAthleteStory = buildRBHQIntelligenceV1({
  id: 'rb-women-non-wnba-athlete-story',
  channel_id: 'a1000000-0000-0000-0000-000000000004',
  title: 'Alex Morgan calls out the coverage gap in women\'s soccer',
  hook: 'Alex Morgan made the media coverage point without overdoing it',
  source_name: 'Women\'s Sports Network',
  source_type: 'youtube_rss',
  sport: 'soccer',
  league: 'NWSL',
  duration_seconds: 21,
  ai_score: 60,
  virality_score: 60,
  hook_strength: 60,
  published_at: new Date().toISOString(),
  text: 'Alex Morgan athlete-centered women sports story about media coverage, league growth, player quote, fans reacting, and a clear human angle.',
  moderation_notes: [],
  risk_flags: [],
})
const rbWomenFlaujaeVisibility = buildRBHQIntelligenceV1({
  id: 'rb-women-flaujae-visibility',
  channel_id: 'a1000000-0000-0000-0000-000000000004',
  title: 'Flau\'jae Johnson production is louder than the national conversation',
  hook: 'Flau\'jae Johnson put the production on tape and the coverage still lagged',
  source_name: 'Just Women\'s Sports',
  source_type: 'youtube_rss',
  sport: 'basketball',
  league: 'NCAA WBB',
  duration_seconds: 32,
  ai_score: 70,
  virality_score: 72,
  hook_strength: 72,
  published_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  text: 'Flau\'jae Johnson production, points, assists, defense, and game footage created a basketball evidence case while national conversation and media visibility lagged behind the play.',
  moderation_notes: [],
  risk_flags: [],
})
const rbWomenKelseyStarSystem = buildRBHQIntelligenceV1({
  id: 'rb-women-kelsey-star-system',
  channel_id: 'a1000000-0000-0000-0000-000000000004',
  title: 'Kelsey Mitchell production versus star-system coverage keeps showing up',
  hook: 'Kelsey Mitchell keeps bringing production while the star system decides the spotlight',
  source_name: 'Indiana Fever',
  source_type: 'youtube_rss',
  sport: 'basketball',
  league: 'WNBA',
  duration_seconds: 28,
  ai_score: 68,
  virality_score: 70,
  hook_strength: 70,
  published_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
  text: 'Kelsey Mitchell production versus star-system coverage with points, efficiency, buckets, and a clear popularity versus production debate from game footage.',
  moderation_notes: [],
  risk_flags: [],
})
const rbWomenCaitlinAssistCredit = buildRBHQIntelligenceV1({
  id: 'rb-women-caitlin-assist-credit',
  channel_id: 'a1000000-0000-0000-0000-000000000004',
  title: 'Caitlin Clark assist sparks credit distribution debate',
  hook: 'Caitlin Clark created the assist, but the play is really about who gets the credit',
  source_name: 'WNBA',
  source_type: 'youtube_rss',
  sport: 'basketball',
  league: 'WNBA',
  duration_seconds: 18,
  ai_score: 68,
  virality_score: 70,
  hook_strength: 70,
  published_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  text: 'Caitlin Clark assist, basketball IQ, pass timing, teammate finish, and credit distribution debate. The clip has clear game footage and asks who gets credit for creating the bucket.',
  moderation_notes: [],
  risk_flags: [],
})
const rbWomenBasketballEvidenceGuardrail = buildRBHQIntelligenceV1({
  id: 'rb-women-basketball-evidence-guardrail',
  channel_id: 'a1000000-0000-0000-0000-000000000004',
  title: 'Highlights: Kelsey Mitchell and Caitlin Clark lead Fever past Liberty',
  hook: 'Caitlin Clark elite basketball is the clip topic to watch',
  source_name: 'WNBA on NBC',
  source_type: 'youtube_rss',
  sport: 'basketball',
  league: 'WNBA',
  duration_seconds: 24,
  ai_score: 90,
  virality_score: 90,
  hook_strength: 90,
  published_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  text: 'RB Women post now: 95/100 on Caitlin Clark elite basketball. Lead with the basketball, frame the basketball evidence without forcing a race-only read. Kelsey Mitchell scored 33 points and Caitlin Clark added 17 points and 7 assists in game highlights.',
  moderation_notes: [],
  risk_flags: [],
})
const rbWomenMvpRaceGuardrail = buildRBHQIntelligenceV1({
  id: 'rb-women-mvp-race-guardrail',
  channel_id: 'a1000000-0000-0000-0000-000000000004',
  title: 'How Paige Bueckers, Olivia Miles, Breanna Stewart stack up in WNBA MVP race',
  hook: 'The MVP race is about production versus attention',
  source_name: 'WNBA on NBC',
  source_type: 'youtube_rss',
  sport: 'basketball',
  league: 'WNBA',
  duration_seconds: 30,
  ai_score: 88,
  virality_score: 88,
  hook_strength: 88,
  published_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  text: 'Paige Bueckers, Olivia Miles, Breanna Stewart, and Aja Wilson are in an MVP race driven by points, assists, efficiency, production, and star-system coverage.',
  moderation_notes: [],
  risk_flags: [],
})
const rbWomenRoutinePromoHold = buildRBHQIntelligenceV1({
  id: 'rb-women-routine-promo-hold',
  channel_id: 'a1000000-0000-0000-0000-000000000004',
  title: 'WNBA sponsor announces ticket promo and updated schedule',
  hook: 'The league announced a sponsor ticket promo',
  source_name: 'WNBA',
  source_type: 'youtube_rss',
  sport: 'basketball',
  league: 'WNBA',
  duration_seconds: 20,
  ai_score: 65,
  virality_score: 55,
  hook_strength: 45,
  published_at: new Date().toISOString(),
  text: 'Sponsor ad, ticket promo, merch mention, schedule announcement, and routine community appearance without a player story, quote, or useful footage.',
  moderation_notes: [],
  risk_flags: [],
})
const rbWomenPaigeProduction = buildRBHQIntelligenceV1({
  id: 'rb-women-paige-production-title',
  channel_id: 'a1000000-0000-0000-0000-000000000004',
  title: 'Highlights: Paige Bueckers Shines in 25-Point Performance vs Sparks | 7.19.26',
  hook: 'Paige Bueckers keeps putting production on the board',
  source_name: 'Dallas Wings',
  source_type: 'youtube_rss',
  sport: 'basketball',
  league: 'WNBA',
  duration_seconds: 30,
  ai_score: 92,
  virality_score: 92,
  hook_strength: 88,
  published_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  text: 'Paige Bueckers 25 points, production, highlights, game footage, and basketball evidence.',
  moderation_notes: [],
  risk_flags: [],
})
const rbWomenKelseyProductionTitle = buildRBHQIntelligenceV1({
  id: 'rb-women-kelsey-production-title',
  channel_id: 'a1000000-0000-0000-0000-000000000004',
  title: 'Kelsey Mitchell EXPLODES for 33 PTS On Second Night of Back-to-Back WINS | FULL HIGHLIGHTS',
  hook: 'Kelsey Mitchell keeps forcing the production conversation',
  source_name: 'Indiana Fever',
  source_type: 'youtube_rss',
  sport: 'basketball',
  league: 'WNBA',
  duration_seconds: 30,
  ai_score: 92,
  virality_score: 92,
  hook_strength: 88,
  published_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  text: 'Old candidate copy said Caitlin Clark credit distribution, but the title and footage are Kelsey Mitchell 33 PTS production, consistency, buckets, and basketball evidence.',
  moderation_notes: [],
  risk_flags: [],
})
const rbSportsClutchNbaHighlight = buildRBHQIntelligenceV1({
  id: 'rb-sports-clutch-nba',
  channel_id: 'a1000000-0000-0000-0000-000000000001',
  title: 'Lakers hit clutch game winner after controversial final possession',
  hook: 'The final play changed the entire game',
  source_name: 'NBA',
  source_type: 'youtube_rss',
  sport: 'basketball',
  league: 'NBA',
  duration_seconds: 22,
  ai_score: 75,
  virality_score: 82,
  hook_strength: 80,
  published_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
  text: 'Lakers clutch game winner, controversial final possession, fan debate, and clear highlight evidence.',
  moderation_notes: [],
  risk_flags: [],
})
const rbSportsBadCallDevelop = buildRBHQIntelligenceV1({
  id: 'rb-sports-bad-call',
  channel_id: 'a1000000-0000-0000-0000-000000000001',
  title: 'Lakers win after controversial bad call has fans split',
  hook: 'The whistle changed the final possession',
  source_name: 'NBA',
  source_type: 'youtube_rss',
  sport: 'basketball',
  league: 'NBA',
  duration_seconds: 70,
  ai_score: 65,
  virality_score: 65,
  hook_strength: 65,
  published_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  text: 'Lakers controversial bad call, refs, final possession, and fans split over the whistle.',
  moderation_notes: [],
  risk_flags: [],
})
const rbSportsTradeFresh = buildRBHQIntelligenceV1({
  id: 'rb-sports-trade-fresh',
  channel_id: 'a1000000-0000-0000-0000-000000000001',
  title: 'Breaking: Luka Doncic trade talks change the Lakers roster picture',
  hook: 'This roster move changes the whole conference',
  source_name: 'ESPN',
  source_type: 'youtube_rss',
  sport: 'basketball',
  league: 'NBA',
  duration_seconds: 24,
  ai_score: 75,
  virality_score: 82,
  hook_strength: 80,
  published_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  text: 'Breaking trade reaction, Luka Doncic, Lakers roster movement, sources, fan debate, and current NBA conversation.',
  moderation_notes: [],
  risk_flags: [],
})
const rbSportsScheduleHold = buildRBHQIntelligenceV1({
  id: 'rb-sports-schedule-hold',
  channel_id: 'a1000000-0000-0000-0000-000000000001',
  title: 'NBA announces updated broadcast schedule and ticket info',
  hook: 'The league announced schedule details',
  source_name: 'NBA',
  source_type: 'youtube_rss',
  sport: 'basketball',
  league: 'NBA',
  duration_seconds: 20,
  ai_score: 70,
  virality_score: 60,
  hook_strength: 50,
  published_at: new Date().toISOString(),
  text: 'Schedule, ticket, broadcast, and sponsor filler with no player, team, quote, or useful highlight moment.',
  moderation_notes: [],
  risk_flags: [],
})
const rbSportsBettingHold = buildRBHQIntelligenceV1({
  id: 'rb-sports-betting-hold',
  channel_id: 'a1000000-0000-0000-0000-000000000001',
  title: 'Best parlay odds and fantasy waiver picks for tonight',
  hook: 'Sportsbook picks for the slate',
  source_name: 'ESPN',
  source_type: 'youtube_rss',
  sport: 'basketball',
  league: 'NBA',
  duration_seconds: 20,
  ai_score: 70,
  virality_score: 70,
  hook_strength: 60,
  published_at: new Date().toISOString(),
  text: 'Sportsbook odds, prop bet, parlay, fantasy, waiver, and start/sit advice with no sports clip moment.',
  moderation_notes: [],
  risk_flags: [],
})
const rbSportsLongPodcastHold = buildRBHQIntelligenceV1({
  id: 'rb-sports-long-podcast-hold',
  channel_id: 'a1000000-0000-0000-0000-000000000001',
  title: 'Full episode podcast: evergreen debate without timestamps',
  hook: 'Long podcast debate',
  source_name: 'ESPN',
  source_type: 'youtube_rss',
  sport: 'basketball',
  league: 'NBA',
  duration_seconds: 3600,
  ai_score: 70,
  virality_score: 70,
  hook_strength: 60,
  published_at: new Date().toISOString(),
  text: 'Full episode podcast, evergreen debate, longform, no timestamps, and no useful short-form clip segment.',
  moderation_notes: [],
  risk_flags: [],
})
const rbSportsWnbaSpilloverHold = buildRBHQIntelligenceV1({
  id: 'rb-sports-wnba-spillover-hold',
  channel_id: 'a1000000-0000-0000-0000-000000000001',
  title: 'CAITLIN CLARK HISTORIC NIGHT NEW CAREER HIGH & FASTEST PLAYER TO 200 CAREER 3PM | WNBA on ESPN',
  hook: 'Caitlin had the performance everyone is talking about',
  source_name: 'ESPN',
  source_type: 'youtube_rss',
  sport: 'basketball',
  league: 'WNBA',
  duration_seconds: 30,
  ai_score: 82,
  virality_score: 82,
  hook_strength: 80,
  published_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  text: 'WNBA on ESPN, Caitlin Clark, career high, 200 career threes, star performance, and women’s basketball.',
  moderation_notes: [],
  risk_flags: [],
})
const rbSportsPeachJamEntities = buildRBHQIntelligenceV1({
  id: 'rb-sports-peach-jam-entities',
  channel_id: 'a1000000-0000-0000-0000-000000000001',
  title: '15U 2026 Peach Jam Championship | Roman Henry, MOKAN Elite vs. Marquice Pless, AZ Unity',
  hook: 'The championship matchup has real prospect names',
  source_name: 'NBA',
  source_type: 'youtube_rss',
  sport: 'basketball',
  league: 'NBA',
  duration_seconds: 32,
  ai_score: 76,
  virality_score: 76,
  hook_strength: 72,
  published_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  text: 'Peach Jam championship, Roman Henry, MOKAN Elite, Marquice Pless, AZ Unity, playoff stakes, and highlight evidence.',
  moderation_notes: [],
  risk_flags: [],
})
const rbSportsSummerLeagueTeams = buildRBHQIntelligenceV1({
  id: 'rb-sports-summer-league-teams',
  channel_id: 'a1000000-0000-0000-0000-000000000001',
  title: 'NUGGETS vs RAPTORS | LAS VEGAS SUMMER LEAGUE | FULL GAME HIGHLIGHTS | July 19, 2026',
  hook: 'Summer League highlights with team context',
  source_name: 'NBA',
  source_type: 'youtube_rss',
  sport: 'basketball',
  league: 'NBA',
  duration_seconds: 30,
  ai_score: 80,
  virality_score: 80,
  hook_strength: 76,
  published_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
  text: 'Nuggets vs Raptors, Las Vegas Summer League, full game highlights, NBA, and current team development evidence.',
  moderation_notes: [],
  risk_flags: [],
})
const rbSportsChiefsQuote = buildRBHQIntelligenceV1({
  id: 'rb-sports-chiefs-quote',
  channel_id: 'a1000000-0000-0000-0000-000000000001',
  title: 'Patrick Mahomes and Andy Reid react after Chiefs playoff win',
  hook: 'Mahomes and Reid had the quote after the game',
  source_name: 'Kansas City Chiefs',
  source_type: 'youtube_rss',
  sport: 'football',
  league: 'NFL',
  duration_seconds: 28,
  ai_score: 70,
  virality_score: 74,
  hook_strength: 74,
  published_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  text: 'Chiefs playoff press conference reaction with Patrick Mahomes, Andy Reid, quote, and fan debate.',
  moderation_notes: [],
  risk_flags: [],
})
const rbSportsCowboysReaction = buildRBHQIntelligenceV1({
  id: 'rb-sports-cowboys-reaction',
  channel_id: 'a1000000-0000-0000-0000-000000000001',
  title: 'Cowboys loss reaction gets heated after Dak Prescott quote',
  hook: 'Dak had to answer for the loss',
  source_name: 'Dallas Cowboys',
  source_type: 'youtube_rss',
  sport: 'football',
  league: 'NFL',
  duration_seconds: 26,
  ai_score: 70,
  virality_score: 74,
  hook_strength: 74,
  published_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  text: 'Cowboys upset loss reaction, Dak Prescott quote, fan debate, and team accountability.',
  moderation_notes: [],
  risk_flags: [],
})
const rbSportsDailyPlan = buildDailyContentPlan([
  {
    id: 'rb-sports-plan-post',
    channel_id: 'a1000000-0000-0000-0000-000000000001',
    title: 'Lakers hit clutch game winner after controversial final possession',
    hook: 'The final play changed the entire game',
    source_name: 'NBA',
    source_type: 'youtube_rss',
    sport: 'basketball',
    league: 'NBA',
    duration_seconds: 22,
    ai_score: 75,
    virality_score: 82,
    hook_strength: 80,
    published_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    text: 'Lakers clutch game winner, controversial final possession, fan debate, and clear highlight evidence.',
    status: 'candidate',
    publish_status: 'not_ready',
  },
  {
    id: 'rb-sports-plan-develop',
    channel_id: 'a1000000-0000-0000-0000-000000000001',
    title: 'Lakers win after controversial bad call has fans split',
    hook: 'The whistle changed the final possession',
    source_name: 'NBA',
    source_type: 'youtube_rss',
    sport: 'basketball',
    league: 'NBA',
    duration_seconds: 70,
    ai_score: 65,
    virality_score: 65,
    hook_strength: 65,
    published_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    text: 'Lakers controversial bad call, refs, final possession, and fans split over the whistle.',
    status: 'candidate',
    publish_status: 'not_ready',
  },
  {
    id: 'rb-sports-plan-hold',
    channel_id: 'a1000000-0000-0000-0000-000000000001',
    title: 'NBA announces updated broadcast schedule and ticket info',
    hook: 'The league announced schedule details',
    source_name: 'NBA',
    source_type: 'youtube_rss',
    sport: 'basketball',
    league: 'NBA',
    duration_seconds: 20,
    ai_score: 70,
    virality_score: 60,
    hook_strength: 50,
    published_at: new Date().toISOString(),
    text: 'Schedule, ticket, broadcast, and sponsor filler with no player, team, quote, or useful highlight moment.',
    status: 'candidate',
    publish_status: 'not_ready',
  },
])
const storedNotes = withStoredRBHQIntelligenceV1([], sports)
const stored = getStoredRBHQIntelligenceV1(storedNotes)
const fallback = getRBHQIntelligenceV1({ ...sportsClip, moderation_notes: storedNotes })
const sourceCandidateSummary: SourceCandidateSummary = {
  id: 'source-candidate-smoke',
  title: 'Breaking source candidate with operator context',
  videoUrl: 'https://www.youtube.com/watch?v=SOURCECANDIDATE',
  thumbnailUrl: null,
  publishedAt: new Date().toISOString(),
  sourceName: 'ESPN',
  targetLane: 'RB Sports',
  score: 88,
  rankLabel: 'must_post',
  urgency: 'post_now',
  hook: 'The operator needs this source candidate now',
  suggestedCaption: 'Source candidate caption draft.',
  suggestedHashtags: ['#SourceCandidate', '#RunnitBack'],
  whyNow: 'Source candidate has live timing.',
  operatorSummary: 'Operator summary should surface in the daily plan.',
}
const plan = buildDailyContentPlan([
  { ...sportsClip, moderation_notes: storedNotes, status: 'pending', publish_status: 'not_ready' },
  { ...arenaClip, status: 'pending', publish_status: 'not_ready' },
  { ...highScoreEvergreenCandidate, status: 'pending', publish_status: 'not_ready' },
], [sourceCandidateSummary])
const rbWomenSourceCandidatePlan = buildDailyContentPlan([], [
  {
    id: 'rb-women-source-kelsey',
    title: 'Kelsey Mitchell EXPLODES for 33 PTS On Second Night of Back-to-Back WINS | FULL HIGHLIGHTS',
    videoUrl: 'https://www.youtube.com/watch?v=KELSEY',
    thumbnailUrl: null,
    publishedAt: new Date().toISOString(),
    sourceName: 'Indiana Fever',
    targetLane: 'RB Women',
    score: 100,
    rankLabel: 'must_post',
    urgency: 'post_now',
    hook: 'Kelsey Mitchell production is the clip topic to watch.',
    playerEntity: 'Kelsey Mitchell',
    scoutLabel: 'post_now',
    rbAngle: 'basketball evidence',
    packageRenderStatus: {
      packageId: 'rb-women-kelsey-package',
      clipPrepStatus: 'metadata_only',
      localRenderStatus: 'attached',
      localRenderAttached: true,
      localAssetPath: '/tmp/rb-women-kelsey.mp4',
    },
    transcriptSourceStatus: {
      subtitleSource: 'metadata_only',
      transcriptTimed: false,
      sourceType: 'youtube_rss',
      sourceStatus: 'metadata_only',
    },
    suggestedCaption: 'Kelsey Mitchell put production on the table, so the basketball has to lead the conversation.',
    suggestedHashtags: ['#KelseyMitchell', '#BasketballHighlights', '#RunnitBackWomen'],
    whyNow: 'Post now: Kelsey Mitchell production has story plus basketball evidence inside the 72-hour RB Women scouting window.',
    operatorSummary: 'RB Women post now: 85/100 on Kelsey Mitchell production. Lead with the basketball.',
  },
  {
    id: 'rb-women-source-caitlin-develop',
    title: 'Highlights: Caitlin Clark drops 45 points, reaches 200 career 3-pointers | WNBA on NBC | 07/17/26',
    videoUrl: 'https://www.youtube.com/watch?v=CAITLIN',
    thumbnailUrl: null,
    publishedAt: new Date().toISOString(),
    sourceName: 'WNBA on NBC',
    targetLane: 'RB Women',
    score: 95,
    rankLabel: 'must_post',
    urgency: 'post_now',
    hook: 'Caitlin Clark production is the clip topic to watch.',
    playerEntity: 'Caitlin Clark',
    scoutLabel: 'develop',
    rbAngle: 'basketball evidence',
    suggestedCaption: 'Caitlin Clark put production on the table, so the basketball has to lead the conversation.',
    suggestedHashtags: ['#CaitlinClark', '#WNBA', '#RunnitBackWomen'],
    whyNow: 'Develop: Caitlin Clark production needs operator judgment on story and basketball evidence before it becomes post-now.',
    operatorSummary: 'RB Women develop: 75/100 on Caitlin Clark production.',
  },
  {
    id: 'rb-women-source-hold',
    title: 'Sue Bird has high praise for Olivia Miles 🙌',
    videoUrl: 'https://www.youtube.com/shorts/HOLD',
    thumbnailUrl: null,
    publishedAt: new Date().toISOString(),
    sourceName: 'WNBA on NBC',
    targetLane: 'RB Women',
    score: 100,
    rankLabel: 'must_post',
    urgency: 'post_now',
    hook: 'Where do you land on this veteran-versus-rookie moment?',
    playerEntity: 'Olivia Miles',
    scoutLabel: 'hold',
    rbAngle: 'basketball evidence',
    suggestedCaption: 'Olivia Miles made the veteran-versus-rookie feel immediate.',
    suggestedHashtags: ['#OliviaMiles', '#WNBA', '#RunnitBackWomen'],
    whyNow: 'Hold: Olivia Miles veteran rookie matchup needs operator judgment before it becomes post-now.',
    operatorSummary: 'RB Women hold: 55/100 on Olivia Miles veteran rookie matchup.',
  },
])
const rbWomenDailyPlan = buildDailyContentPlan([
  {
    id: 'rb-women-daily-plan-flaujae',
    channel_id: 'a1000000-0000-0000-0000-000000000004',
    title: 'Flau\'jae Johnson production is louder than the national conversation',
    hook: 'Flau\'jae Johnson put the production on tape and the coverage still lagged',
    source_name: 'Just Women\'s Sports',
    source_type: 'youtube_rss',
    sport: 'basketball',
    league: 'NCAA WBB',
    duration_seconds: 32,
    ai_score: 70,
    virality_score: 72,
    hook_strength: 72,
    published_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    text: 'Flau\'jae Johnson production, points, assists, defense, and game footage created a basketball evidence case while national conversation and media visibility lagged behind the play.',
    status: 'approved_for_handoff',
    publish_status: 'needs_clip_render',
    package_readiness: {
      macMiniPackageId: 'rb-women-flaujae-package',
      clipPrepStatus: 'ready',
      localRenderStatus: 'attached',
      localRenderAttached: true,
      localAssetPath: '/tmp/rb-women-flaujae.mp4',
      clipPrep: {
        status: 'ready',
        transcriptTimed: true,
        captionPrep: {
          subtitle_source: 'transcript',
        },
      },
    },
  },
  {
    id: 'rb-women-daily-plan-kelsey',
    channel_id: 'a1000000-0000-0000-0000-000000000004',
    title: 'Kelsey Mitchell EXPLODES for 33 PTS On Second Night of Back-to-Back WINS | FULL HIGHLIGHTS',
    hook: 'Kelsey Mitchell keeps bringing production while the star system decides the spotlight',
    source_name: 'Indiana Fever',
    source_type: 'youtube_rss',
    sport: 'basketball',
    league: 'WNBA',
    duration_seconds: 28,
    ai_score: 68,
    virality_score: 70,
    hook_strength: 70,
    published_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    text: 'Old candidate copy said Caitlin Clark credit distribution, but the title and footage are Kelsey Mitchell 33 PTS production, consistency, buckets, and basketball evidence.',
    status: 'candidate',
    publish_status: 'not_ready',
  },
  {
    id: 'rb-women-daily-plan-must-post',
    channel_id: 'a1000000-0000-0000-0000-000000000004',
    title: 'Caitlin Clark foul debate has fans split after the whistle',
    hook: 'Caitlin Clark sold the contact and the whistle changed everything',
    source_name: 'WNBA',
    source_type: 'youtube_rss',
    sport: 'basketball',
    league: 'WNBA',
    duration_seconds: 20,
    ai_score: 70,
    virality_score: 70,
    hook_strength: 70,
    published_at: new Date().toISOString(),
    text: 'Caitlin Clark foul debate after a controversial whistle. Fans are split on whether the officiating was fair or if she sold the contact.',
    status: 'approved_for_handoff',
    publish_status: 'needs_clip_render',
    package_readiness: {
      macMiniPackageId: 'rb-women-package',
      clipPrepStatus: 'metadata_only',
      localRenderStatus: 'attached',
      localRenderAttached: true,
      localAssetPath: '/tmp/rb-women-package.mp4',
    },
  },
  {
    id: 'rb-women-daily-plan-maybe',
    channel_id: 'a1000000-0000-0000-0000-000000000004',
    title: 'Alex Morgan calls out the coverage gap in women\'s soccer',
    hook: 'Alex Morgan made the media coverage point without overdoing it',
    source_name: 'All Women\'s Sports Network',
    source_type: 'youtube_rss',
    sport: 'soccer',
    league: 'NWSL',
    duration_seconds: 21,
    ai_score: 60,
    virality_score: 60,
    hook_strength: 60,
    published_at: new Date().toISOString(),
    text: 'Alex Morgan athlete-centered women sports story about media coverage, league growth, player quote, fans reacting, and a clear human angle.',
    status: 'candidate',
    publish_status: 'not_ready',
  },
  {
    id: 'rb-women-daily-plan-hold',
    channel_id: 'a1000000-0000-0000-0000-000000000004',
    title: 'WNBA announces updated regular season broadcast schedule',
    hook: 'The league announced the new schedule',
    source_name: 'WNBA',
    source_type: 'youtube_rss',
    sport: 'basketball',
    league: 'WNBA',
    duration_seconds: 28,
    ai_score: 70,
    virality_score: 60,
    hook_strength: 50,
    published_at: new Date().toISOString(),
    text: 'The league announced schedule updates, broadcast windows, ticket information, and general regular season details.',
    status: 'candidate',
    publish_status: 'not_ready',
  },
])
const rbWomenKelseyDailyPlan = buildDailyContentPlan([
  {
    id: 'rb-women-daily-plan-kelsey-focused',
    channel_id: 'a1000000-0000-0000-0000-000000000004',
    title: 'Kelsey Mitchell EXPLODES for 33 PTS On Second Night of Back-to-Back WINS | FULL HIGHLIGHTS',
    hook: 'Kelsey Mitchell keeps bringing production while the star system decides the spotlight',
    source_name: 'Indiana Fever',
    source_type: 'youtube_rss',
    sport: 'basketball',
    league: 'WNBA',
    duration_seconds: 30,
    ai_score: 90,
    virality_score: 90,
    hook_strength: 85,
    published_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    text: 'Old candidate copy said Caitlin Clark credit distribution, but the title and footage are Kelsey Mitchell 33 PTS production, consistency, buckets, and basketball evidence.',
    status: 'approved_for_handoff',
    publish_status: 'needs_clip_render',
  },
])

assert.equal(stored?.score, sports.score)
assert.equal(fallback.score, sports.score)
assert.ok(sports.score >= 0 && sports.score <= 100)
assert.equal(sports.rbSports?.scoutLabel, 'post_now')
assert.equal(sports.rbSports?.rbAngle, 'trade / roster movement')
assert.equal(sports.rbSports?.scoutingWindowHours, 48)
assert.equal(sports.rbSports?.breakingWindowHours, 6)
assert.ok(sports.suggestedCaption.includes('roster conversation'))
assert.ok(!sports.suggestedCaption.includes('timeline has a take'))
assert.ok(sports.whyNow.includes('48-hour RB Sports scouting window'))
assert.ok(sports.whyNow.includes('0-6 hour urgency'))
assert.ok(sports.operatorSummary.includes('RB Sports post now'))
assert.ok(sports.suggestedHashtags.some((tag) => tag.toLowerCase().includes('tradetalk')))
assert.ok(arena.suggestedHashtags.some((tag) => tag.toLowerCase().includes('gaming')))
assert.ok(arena.suggestedCaption.includes('gaming feed'))
assert.ok(!arena.suggestedCaption.includes('timeline has a take'))
assert.ok(arena.whyNow.includes('clutch/upset'))
assert.ok(arena.whyNow.includes('before the match, patch, or lobby conversation moves on'))
assert.ok(neutralSourceCandidate.suggestedCaption.includes('Test the strongest moment'))
assert.ok(!neutralSourceCandidate.suggestedCaption.includes('This clip is the angle'))
assert.ok(!neutralSourceCandidate.reasons.some((reason) => reason.includes('Source authority')))
assert.ok(!womenTournamentCandidate.whyNow.includes('gaming update'))
assert.ok(!womenTournamentCandidate.operatorSummary.includes('gaming update'))
assert.ok(!womenTournamentCandidate.suggestedHashtags.some((tag) => tag.toLowerCase().includes('gaming')))
assert.ok(womenTournamentCandidate.whyNow.includes('women college basketball'))
assert.ok(womenTournamentCandidate.whyNow.includes('post-now'))
assert.ok(!futbolTournamentCandidate.whyNow.includes('gaming update'))
assert.ok(!futbolTournamentCandidate.operatorSummary.includes('gaming update'))
assert.ok(!futbolTournamentCandidate.suggestedHashtags.some((tag) => tag.toLowerCase().includes('gaming')))
assert.ok(futbolTournamentCandidate.suggestedCaption.includes('futbol feed'))
assert.ok(futbolTournamentCandidate.operatorSummary.includes('RB Futbol'))
assert.ok(cfbSourceCandidate.suggestedCaption.includes('college football feed'))
assert.ok(cfbSourceCandidate.whyNow.includes('college football timeline'))
assert.ok(combatBoxingCandidate.suggestedHashtags.includes('#CombatSports'))
assert.ok(!combatBoxingCandidate.suggestedHashtags.includes('#UFC'))
assert.ok(combatBoxingCandidate.whyNow.includes('fight fans'))
assert.equal(staleSourceCandidate.urgency, 'evergreen')
assert.ok(staleSourceCandidate.whyNow.includes('not in a live viral window'))
assert.ok(!staleSourceCandidate.suggestedHashtags.includes('#PatchNotes'))
assert.equal(highScoreEvergreen.urgency, 'hold')
assert.equal(highScoreEvergreen.rankLabel, 'low_priority')
assert.equal(highScoreEvergreen.rbSports?.scoutLabel, 'hold')
assert.ok(highScoreEvergreen.reasons.some((reason) => reason.includes('48-hour scouting window')))
assert.ok(rbWomenCaitlinFoulDebate.score >= 80)
assert.equal(rbWomenCaitlinFoulDebate.rankLabel, 'must_post')
assert.equal(rbWomenCaitlinFoulDebate.urgency, 'post_now')
assert.equal(rbWomenCaitlinFoulDebate.rbWomen?.contentPillar, 'debate')
assert.equal(rbWomenCaitlinFoulDebate.rbWomen?.featuredPlayer, 'Caitlin Clark')
assert.equal(rbWomenCaitlinFoulDebate.rbWomen?.debateTopic, 'officiating/fairness')
assert.equal(rbWomenCaitlinFoulDebate.rbWomen?.expectedEngagementType, 'argumentative_comments')
assert.equal(rbWomenCaitlinFoulDebate.rbWomen?.decisionBand, 'high_confidence')
assert.deepEqual(Object.keys(rbWomenCaitlinFoulDebate.rbWomen?.hooks ?? {}).sort(), ['debate', 'reaction', 'search_first'])
assert.equal(rbWomenCaitlinFoulDebate.rbWomen?.hookType, 'debate')
assert.equal(rbWomenCaitlinFoulDebate.rbWomen?.hooks.reaction.includes('Caitlin Clark'), true)
assert.equal(rbWomenCaitlinFoulDebate.rbWomen?.hooks.debate.includes('?'), true)
assert.ok(rbWomenCaitlinFoulDebate.rbWomen?.hooks.search_first.includes('Caitlin Clark'))
assert.ok(rbWomenCaitlinFoulDebate.suggestedCaption.includes('Caitlin Clark'))
assert.ok(rbWomenCaitlinFoulDebate.suggestedCaption.length <= 180)
assert.ok(rbWomenCaitlinFoulDebate.suggestedHashtags.length <= 5)
assert.ok(!rbWomenCaitlinFoulDebate.suggestedHashtags.some((tag) => ['#fyp', '#viral', '#trending'].includes(tag.toLowerCase())))
assert.ok(rbWomenCaitlinFoulDebate.suggestedHashtags.includes('#CaitlinClark'))
assert.ok(rbWomenCaitlinFoulDebate.operatorSummary.includes('debate'))
assert.ok(rbWomenCaitlinFoulDebate.whyNow.includes('officiating'))
assert.ok(rbWomenCaitlinFoulDebate.rbWomen?.suggestedPinnedComment.includes('whistle'))
assert.ok(rbWomenKaylaOliviaMatchup.score >= 80)
assert.equal(rbWomenKaylaOliviaMatchup.urgency, 'post_now')
assert.equal(rbWomenKaylaOliviaMatchup.rbWomen?.contentPillar, 'debate')
assert.equal(rbWomenKaylaOliviaMatchup.rbWomen?.featuredPlayer, 'Kayla McBride')
assert.equal(rbWomenKaylaOliviaMatchup.rbWomen?.debateTopic, 'veteran-versus-rookie')
assert.ok(rbWomenKaylaOliviaMatchup.rbWomen?.hooks.search_first.includes('Kayla McBride'))
assert.ok(rbWomenKaylaOliviaMatchup.suggestedHashtags.includes('#KaylaMcBride'))
assert.ok(rbWomenKaylaOliviaMatchup.suggestedHashtags.includes('#OliviaMiles'))
assert.ok(rbWomenPaigeRepresentationQuote.score >= 80)
assert.equal(rbWomenPaigeRepresentationQuote.rbWomen?.contentPillar, 'player_personality')
assert.equal(rbWomenPaigeRepresentationQuote.rbWomen?.featuredPlayer, 'Paige Bueckers')
assert.equal(rbWomenPaigeRepresentationQuote.rbWomen?.expectedEngagementType, 'quote_reactions')
assert.equal(rbWomenPaigeRepresentationQuote.rbWomen?.primarySearchTopic, 'Paige Bueckers representation quote')
assert.ok(rbWomenPaigeRepresentationQuote.rbWomen?.hooks.search_first.includes('Paige Bueckers'))
assert.ok(rbWomenPaigeRepresentationQuote.suggestedCaption.includes('Paige Bueckers'))
assert.ok(rbWomenPaigeRepresentationQuote.suggestedHashtags.includes('#PaigeBueckers'))
assert.ok(rbWomenGenericAnnouncement.score < 50)
assert.equal(rbWomenGenericAnnouncement.rankLabel, 'low_priority')
assert.equal(rbWomenGenericAnnouncement.urgency, 'hold')
assert.equal(rbWomenGenericAnnouncement.rbWomen?.decisionBand, 'reject')
assert.equal(rbWomenGenericAnnouncement.rbWomen?.contentPillar, 'women_sports_expansion')
assert.ok(rbWomenGenericAnnouncement.reasons.some((reason) => reason.includes('generic league news')))
assert.ok(rbWomenContextHeavy.score >= 50 && rbWomenContextHeavy.score <= 64)
assert.equal(rbWomenContextHeavy.rankLabel, 'low_priority')
assert.equal(rbWomenContextHeavy.urgency, 'hold')
assert.equal(rbWomenContextHeavy.rbWomen?.decisionBand, 'hold_unless_timely')
assert.ok(rbWomenContextHeavy.reasons.some((reason) => reason.includes('long explanation')))
assert.ok(rbWomenNonWnbaAthleteStory.score >= 65 && rbWomenNonWnbaAthleteStory.score <= 79)
assert.equal(rbWomenNonWnbaAthleteStory.urgency, 'today')
assert.equal(rbWomenNonWnbaAthleteStory.rbWomen?.contentPillar, 'women_sports_expansion')
assert.equal(rbWomenNonWnbaAthleteStory.rbWomen?.featuredPlayer, 'Alex Morgan')
assert.equal(rbWomenNonWnbaAthleteStory.rbWomen?.primarySearchTopic, 'Alex Morgan media coverage')
assert.equal(rbWomenNonWnbaAthleteStory.rbWomen?.expectedEngagementType, 'story_discussion')
assert.ok(rbWomenNonWnbaAthleteStory.suggestedHashtags.includes('#AlexMorgan'))
assert.ok(rbWomenNonWnbaAthleteStory.suggestedHashtags.includes('#NWSL'))
assert.ok(!rbWomenNonWnbaAthleteStory.suggestedHashtags.includes('#WNBA'))
assert.equal(rbWomenFlaujaeVisibility.rbWomen?.scoutLabel, 'post_now')
assert.equal(rbWomenFlaujaeVisibility.rbWomen?.rbAngle, 'unequal visibility')
assert.ok(rbWomenFlaujaeVisibility.operatorSummary.includes('Lead with the basketball'))
assert.ok(!/race-only/i.test(rbWomenFlaujaeVisibility.suggestedCaption))
assert.ok(['post_now', 'develop'].includes(rbWomenKelseyStarSystem.rbWomen?.scoutLabel ?? ''))
assert.equal(rbWomenKelseyStarSystem.rbWomen?.rbAngle, 'popularity versus production')
assert.equal(rbWomenCaitlinAssistCredit.rbWomen?.rbAngle, 'credit distribution')
assert.ok(rbWomenCaitlinAssistCredit.suggestedCaption.includes('who gets credit'))
assert.ok(!rbWomenCaitlinAssistCredit.suggestedCaption.toLowerCase().includes('generic praise'))
assert.notEqual(rbWomenBasketballEvidenceGuardrail.rbWomen?.rbAngle, 'race and representation')
assert.ok(!rbWomenBasketballEvidenceGuardrail.reasons.some((reason) => reason.includes('race and representation')))
assert.notEqual(rbWomenMvpRaceGuardrail.rbWomen?.rbAngle, 'race and representation')
assert.equal(rbWomenRoutinePromoHold.rbWomen?.scoutLabel, 'hold')
assert.equal(rbWomenRoutinePromoHold.urgency, 'hold')
assert.equal(rbWomenPaigeProduction.rbWomen?.featuredPlayer, 'Paige Bueckers')
assert.equal(rbWomenPaigeProduction.rbWomen?.primarySearchTopic, 'Paige Bueckers production')
assert.equal(rbWomenPaigeProduction.rbWomen?.rbAngle, 'basketball evidence')
assert.ok(rbWomenPaigeProduction.suggestedCaption.includes('Paige Bueckers'))
assert.equal(rbWomenKelseyProductionTitle.rbWomen?.featuredPlayer, 'Kelsey Mitchell')
assert.equal(rbWomenKelseyProductionTitle.rbWomen?.primarySearchTopic, 'Kelsey Mitchell production')
assert.equal(rbWomenKelseyProductionTitle.rbWomen?.rbAngle, 'basketball evidence')
assert.ok(rbWomenKelseyProductionTitle.suggestedCaption.includes('Kelsey Mitchell'))
assert.ok(!rbWomenKelseyProductionTitle.suggestedCaption.includes('Caitlin Clark'))
assert.ok(!rbWomenKelseyProductionTitle.operatorSummary.includes('Caitlin Clark'))
assert.equal(buildRBHQIntelligenceV1({ ...sportsClip, text: 'A\'ja Wilson foul debate' }).rbWomen, undefined)
assert.equal(buildRBHQIntelligenceV1({ ...arenaClip, text: 'Angel Reese quote debate' }).rbWomen, undefined)
assert.equal(rbSportsClutchNbaHighlight.rbSports?.scoutLabel, 'post_now')
assert.equal(rbSportsClutchNbaHighlight.rbSports?.rbAngle, 'clutch proof')
assert.equal(rbSportsClutchNbaHighlight.rbSports?.teamEntity, 'Lakers')
assert.ok(rbSportsClutchNbaHighlight.suggestedCaption.includes('late-game proof'))
assert.ok(rbSportsClutchNbaHighlight.suggestedHashtags.includes('#Clutch'))
assert.ok(['post_now', 'develop'].includes(rbSportsBadCallDevelop.rbSports?.scoutLabel ?? ''))
assert.equal(rbSportsBadCallDevelop.rbSports?.rbAngle, 'bad call / officiating heat')
assert.equal(rbSportsBadCallDevelop.rbSports?.teamEntity, 'Lakers')
assert.equal(rbSportsTradeFresh.rbSports?.scoutLabel, 'post_now')
assert.equal(rbSportsTradeFresh.rbSports?.rbAngle, 'trade / roster movement')
assert.equal(rbSportsTradeFresh.rbSports?.playerEntity, 'Luka Doncic')
assert.ok(rbSportsTradeFresh.whyNow.includes('0-6 hour urgency'))
assert.equal(rbSportsScheduleHold.rbSports?.scoutLabel, 'hold')
assert.equal(rbSportsScheduleHold.urgency, 'hold')
assert.ok(rbSportsScheduleHold.reasons.some((reason) => reason.includes('filler')))
assert.equal(rbSportsBettingHold.rbSports?.scoutLabel, 'hold')
assert.equal(rbSportsBettingHold.urgency, 'hold')
assert.ok(rbSportsBettingHold.reasons.some((reason) => reason.includes('betting')))
assert.equal(rbSportsLongPodcastHold.rbSports?.scoutLabel, 'hold')
assert.equal(rbSportsLongPodcastHold.urgency, 'hold')
assert.ok(rbSportsLongPodcastHold.reasons.some((reason) => reason.includes('longform') || reason.includes('segment')))
assert.equal(rbSportsWnbaSpilloverHold.rbSports?.scoutLabel, 'hold')
assert.equal(rbSportsWnbaSpilloverHold.urgency, 'hold')
assert.equal(rbSportsWnbaSpilloverHold.rbSports?.playerEntity, 'Caitlin Clark')
assert.ok(rbSportsWnbaSpilloverHold.reasons.some((reason) => reason.includes('RB Women Phase 1')))
assert.equal(rbSportsPeachJamEntities.rbSports?.playerEntity, 'Roman Henry')
assert.equal(rbSportsPeachJamEntities.rbSports?.teamEntity, 'MOKAN Elite')
assert.equal(rbSportsPeachJamEntities.rbSports?.rbAngle, 'playoff stakes')
assert.equal(rbSportsSummerLeagueTeams.rbSports?.playerEntity, null)
assert.equal(rbSportsSummerLeagueTeams.rbSports?.teamEntity, 'Nuggets')
assert.notEqual(rbSportsSummerLeagueTeams.rbSports?.playerEntity, 'Las Vegas')
assert.ok(rbSportsSummerLeagueTeams.suggestedCaption.includes('Nuggets'))
assert.equal(rbSportsChiefsQuote.rbSports?.teamEntity, 'Chiefs')
assert.equal(rbSportsChiefsQuote.rbSports?.playerEntity, 'Patrick Mahomes')
assert.equal(rbSportsChiefsQuote.rbSports?.coachEntity, 'Andy Reid')
assert.equal(rbSportsCowboysReaction.rbSports?.teamEntity, 'Cowboys')
assert.equal(rbSportsCowboysReaction.rbSports?.playerEntity, 'Dak Prescott')
assert.ok(plan.suggestedPostingOrder.length >= 1)
assert.ok(plan.topClipsToPostNow.length + plan.strongAlternates.length >= 1)
assert.ok(!plan.topClipsToPostNow.some((clip) => clip.id === highScoreEvergreenCandidate.id))
assert.ok(plan.holdOrLowPriority.some((clip) => clip.id === highScoreEvergreenCandidate.id))
assert.equal(plan.sourceCandidates[0]?.operatorSummary, sourceCandidateSummary.operatorSummary)
assert.equal(rbWomenSourceCandidatePlan.topClipsToPostNow.length, 1)
assert.equal(rbWomenSourceCandidatePlan.strongAlternates.length, 1)
assert.equal(rbWomenSourceCandidatePlan.holdOrLowPriority.length, 1)
assert.equal(rbWomenSourceCandidatePlan.topClipsToPostNow[0]?.playerEntity, 'Kelsey Mitchell')
assert.equal(rbWomenSourceCandidatePlan.topClipsToPostNow[0]?.rbAngle, 'basketball evidence')
assert.equal(rbWomenSourceCandidatePlan.topClipsToPostNow[0]?.packageRenderStatus.localRenderAttached, true)
assert.equal(rbWomenSourceCandidatePlan.topClipsToPostNow[0]?.transcriptSourceStatus.subtitleSource, 'metadata_only')
const rbWomenMustPost = rbWomenDailyPlan.topClipsToPostNow[0]
assert.ok(rbWomenMustPost)
assert.equal(rbWomenDailyPlan.topClipsToPostNow.length, 1)
assert.equal(rbWomenDailyPlan.strongAlternates.length, 1)
assert.equal(rbWomenDailyPlan.holdOrLowPriority.length, 1)
assert.equal(rbWomenDailyPlan.topClipsToPostNow.length + rbWomenDailyPlan.strongAlternates.length + rbWomenDailyPlan.holdOrLowPriority.length, 3)
assert.equal(rbWomenMustPost.scoutLabel, 'post_now')
assert.equal(rbWomenMustPost.clipTopic, 'Flau\'jae Johnson visibility gap')
assert.equal(rbWomenMustPost.playerEntity, 'Flau\'jae Johnson')
assert.equal(rbWomenMustPost.rbAngle, 'unequal visibility')
assert.equal(rbWomenMustPost.sourceName, 'Just Women\'s Sports')
assert.ok(rbWomenMustPost.score >= 80)
assert.ok(rbWomenMustPost.whyThisShouldPostNow.includes('72-hour RB Women scouting window'))
assert.ok(rbWomenMustPost.captionDraft.includes('coverage'))
assert.ok(rbWomenMustPost.hashtagPack.includes('#FlaujaeJohnson'))
assert.ok(rbWomenMustPost.operatorSummary.includes('RB Women'))
assert.equal(rbWomenMustPost.packageRenderStatus.packageId, 'rb-women-flaujae-package')
assert.equal(rbWomenMustPost.packageRenderStatus.localRenderStatus, 'attached')
assert.equal(rbWomenMustPost.packageRenderStatus.localRenderAttached, true)
assert.equal(rbWomenMustPost.transcriptSourceStatus.subtitleSource, 'transcript')
assert.equal(rbWomenMustPost.transcriptSourceStatus.transcriptTimed, true)
const rbWomenMaybe = rbWomenDailyPlan.strongAlternates.find((clip) => clip.id === 'rb-women-daily-plan-maybe')
assert.ok(rbWomenMaybe)
assert.equal(rbWomenMaybe.scoutLabel, 'develop')
assert.equal(rbWomenMaybe.playerEntity, 'Alex Morgan')
assert.ok(rbWomenMaybe.rbAngle)
assert.ok(rbWomenMaybe.reviewReason)
const rbWomenHold = rbWomenDailyPlan.holdOrLowPriority.find((clip) => clip.id === 'rb-women-daily-plan-hold')
assert.ok(rbWomenHold)
assert.equal(rbWomenHold.scoutLabel, 'hold')
assert.equal(rbWomenHold.sourceName, 'WNBA')
assert.ok(rbWomenHold.reviewReason?.includes('generic league news'))
const rbWomenKelseyPlan = rbWomenKelseyDailyPlan.topClipsToPostNow[0]
assert.ok(rbWomenKelseyPlan)
assert.equal(rbWomenKelseyPlan.playerEntity, 'Kelsey Mitchell')
assert.ok(['basketball evidence', 'popularity versus production', 'unequal visibility'].includes(rbWomenKelseyPlan.rbAngle ?? ''))
assert.ok(rbWomenKelseyPlan.captionDraft.includes('Kelsey Mitchell'))
assert.ok(!rbWomenKelseyPlan.captionDraft.includes('Caitlin Clark'))
const rbSportsPostNow = rbSportsDailyPlan.topClipsToPostNow[0]
assert.ok(rbSportsPostNow)
assert.equal(rbSportsDailyPlan.topClipsToPostNow.length, 1)
assert.equal(rbSportsDailyPlan.strongAlternates.length, 1)
assert.equal(rbSportsDailyPlan.holdOrLowPriority.length, 1)
assert.equal(rbSportsPostNow.scoutLabel, 'post_now')
assert.equal(rbSportsPostNow.lane, 'RB Sports')
assert.equal(rbSportsPostNow.teamEntity, 'Lakers')
assert.equal(rbSportsPostNow.rbAngle, 'clutch proof')
assert.ok(rbSportsPostNow.clipTopic.includes('Lakers'))
assert.ok(rbSportsPostNow.whyThisShouldPostNow.includes('48-hour RB Sports scouting window'))
assert.ok(rbSportsPostNow.captionDraft.includes('late-game proof'))
assert.ok(rbSportsPostNow.hashtagPack.includes('#RBSports'))
assert.ok(rbSportsPostNow.operatorSummary.includes('RB Sports post now'))
assert.equal(rbSportsPostNow.packageRenderStatus.localRenderAttached, false)
const rbSportsDevelop = rbSportsDailyPlan.strongAlternates[0]
assert.ok(rbSportsDevelop)
assert.equal(rbSportsDevelop.scoutLabel, 'develop')
assert.equal(rbSportsDevelop.rbAngle, 'bad call / officiating heat')
assert.ok(rbSportsDevelop.reviewReason)
const rbSportsHold = rbSportsDailyPlan.holdOrLowPriority[0]
assert.ok(rbSportsHold)
assert.equal(rbSportsHold.scoutLabel, 'hold')
assert.ok(rbSportsHold.reviewReason?.includes('filler') || rbSportsHold.reviewReason?.includes('weak current'))

console.log(JSON.stringify({
  sports,
  arena,
  neutralSourceCandidate,
  womenTournamentCandidate,
  futbolTournamentCandidate,
  cfbSourceCandidate,
  combatBoxingCandidate,
  staleSourceCandidate,
  highScoreEvergreen,
  rbWomenCaitlinFoulDebate,
  rbWomenKaylaOliviaMatchup,
  rbWomenPaigeRepresentationQuote,
  rbWomenGenericAnnouncement,
  rbWomenContextHeavy,
  rbWomenNonWnbaAthleteStory,
  rbWomenFlaujaeVisibility,
  rbWomenKelseyStarSystem,
  rbWomenCaitlinAssistCredit,
  rbWomenRoutinePromoHold,
  rbSportsClutchNbaHighlight,
  rbSportsBadCallDevelop,
  rbSportsTradeFresh,
  rbSportsScheduleHold,
  rbSportsBettingHold,
  rbSportsLongPodcastHold,
  rbSportsDailyPlan,
  dailyPlan: plan,
  rbWomenDailyPlan,
}, null, 2))
