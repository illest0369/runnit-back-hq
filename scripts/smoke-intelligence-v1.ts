import assert from 'node:assert/strict'

import {
  buildDailyContentPlan,
  buildRBHQIntelligenceV1,
  getRBHQIntelligenceV1,
  getStoredRBHQIntelligenceV1,
  withStoredRBHQIntelligenceV1,
} from '../lib/intelligence-v1'

const sportsClip = {
  id: 'sports-smoke',
  channel_id: 'a1000000-0000-0000-0000-000000000001',
  title: 'Breaking trade reaction after clutch playoff upset',
  hook: 'Fans are losing it after the final play',
  source_name: 'RB Sports Smoke',
  source_type: 'test',
  sport: 'basketball',
  league: 'NBA',
  duration_seconds: 18,
  ai_score: 78,
  virality_score: 84,
  hook_strength: 82,
  created_at: new Date().toISOString(),
  moderation_notes: [],
  risk_flags: [],
}

const arenaClip = {
  id: 'arena-smoke',
  channel_id: 'a1000000-0000-0000-0000-000000000002',
  title: 'Valorant clutch reaction goes viral after patch reveal',
  hook: 'This lobby completely lost it',
  source_name: 'RB Arena Smoke',
  source_type: 'test',
  sport: 'esports',
  league: 'Valorant',
  duration_seconds: 21,
  ai_score: 74,
  virality_score: 80,
  hook_strength: 79,
  created_at: new Date().toISOString(),
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
const storedNotes = withStoredRBHQIntelligenceV1([], sports)
const stored = getStoredRBHQIntelligenceV1(storedNotes)
const fallback = getRBHQIntelligenceV1({ ...sportsClip, moderation_notes: storedNotes })
const plan = buildDailyContentPlan([
  { ...sportsClip, moderation_notes: storedNotes, status: 'pending', publish_status: 'not_ready' },
  { ...arenaClip, status: 'pending', publish_status: 'not_ready' },
])

assert.equal(stored?.score, sports.score)
assert.equal(fallback.score, sports.score)
assert.ok(sports.score >= 0 && sports.score <= 100)
assert.ok(sports.suggestedCaption.includes('breaking reaction'))
assert.ok(sports.suggestedCaption.includes('Quick review:'))
assert.ok(!sports.suggestedCaption.includes('timeline has a take'))
assert.ok(sports.whyNow.includes('breaking/news'))
assert.ok(!sports.whyNow.includes('and still timely'))
assert.ok(sports.suggestedHashtags.some((tag) => tag.toLowerCase().includes('tradetalk')))
assert.ok(arena.suggestedHashtags.some((tag) => tag.toLowerCase().includes('gaming')))
assert.ok(arena.suggestedCaption.includes('gaming feed'))
assert.ok(!arena.suggestedCaption.includes('timeline has a take'))
assert.ok(arena.whyNow.includes('clutch/upset'))
assert.ok(neutralSourceCandidate.suggestedCaption.includes('Test the strongest moment'))
assert.ok(!neutralSourceCandidate.suggestedCaption.includes('This clip is the angle'))
assert.ok(!womenTournamentCandidate.whyNow.includes('gaming update'))
assert.ok(!womenTournamentCandidate.operatorSummary.includes('gaming update'))
assert.ok(!womenTournamentCandidate.suggestedHashtags.some((tag) => tag.toLowerCase().includes('gaming')))
assert.ok(!futbolTournamentCandidate.whyNow.includes('gaming update'))
assert.ok(!futbolTournamentCandidate.operatorSummary.includes('gaming update'))
assert.ok(!futbolTournamentCandidate.suggestedHashtags.some((tag) => tag.toLowerCase().includes('gaming')))
assert.ok(plan.suggestedPostingOrder.length >= 1)
assert.ok(plan.topClipsToPostNow.length + plan.strongAlternates.length >= 1)

console.log(JSON.stringify({
  sports,
  arena,
  neutralSourceCandidate,
  womenTournamentCandidate,
  futbolTournamentCandidate,
  dailyPlan: plan,
}, null, 2))
