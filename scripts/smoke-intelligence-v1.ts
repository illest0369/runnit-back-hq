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

assert.equal(stored?.score, sports.score)
assert.equal(fallback.score, sports.score)
assert.ok(sports.score >= 0 && sports.score <= 100)
assert.ok(sports.suggestedCaption.includes('breaking reaction'))
assert.ok(sports.suggestedCaption.includes('Quick review:'))
assert.ok(!sports.suggestedCaption.includes('timeline has a take'))
assert.ok(sports.whyNow.includes('breaking/news'))
assert.ok(sports.whyNow.includes('0-3 hour viral window'))
assert.ok(sports.operatorSummary.includes('post now in the 0-3 hour viral window'))
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
assert.ok(womenTournamentCandidate.whyNow.includes('championship/playoff/tournament'))
assert.ok(womenTournamentCandidate.whyNow.includes('women\'s sports fans are still reacting'))
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
assert.equal(highScoreEvergreen.urgency, 'evergreen')
assert.equal(highScoreEvergreen.rankLabel, 'must_post')
assert.ok(plan.suggestedPostingOrder.length >= 1)
assert.ok(plan.topClipsToPostNow.length + plan.strongAlternates.length >= 1)
assert.ok(!plan.topClipsToPostNow.some((clip) => clip.id === highScoreEvergreenCandidate.id))
assert.ok(plan.strongAlternates.some((clip) => clip.id === highScoreEvergreenCandidate.id))
assert.equal(plan.sourceCandidates[0]?.operatorSummary, sourceCandidateSummary.operatorSummary)

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
  dailyPlan: plan,
}, null, 2))
