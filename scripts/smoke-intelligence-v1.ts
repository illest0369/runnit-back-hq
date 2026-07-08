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
assert.ok(arena.suggestedHashtags.some((tag) => tag.toLowerCase().includes('gaming')))
assert.ok(plan.suggestedPostingOrder.length >= 1)
assert.ok(plan.topClipsToPostNow.length + plan.strongAlternates.length >= 1)

console.log(JSON.stringify({
  sports,
  arena,
  dailyPlan: plan,
}, null, 2))
