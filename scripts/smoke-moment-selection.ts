import assert from 'node:assert/strict'

import { buildOperatorMomentSelectionUpdate } from '../lib/operator-moment-selection'
import {
  buildMomentCandidatesWithOptionalAiAnalyst,
  createMockAiMomentAnalystProvider,
} from '../lib/ai-moment-analyst'
import {
  buildTikTokClipCandidates,
  TIKTOK_MOMENT_RECOMMENDATION_MODEL,
} from '../lib/tiktok-clip-scout'

function overlaps(left: { start_seconds: number | null; end_seconds: number | null }, right: { start_seconds: number | null; end_seconds: number | null }) {
  if (left.start_seconds === null || left.end_seconds === null || right.start_seconds === null || right.end_seconds === null) return false
  return left.start_seconds < right.end_seconds && right.start_seconds < left.end_seconds
}

async function main() {
  const video = {
    id: 'video-moment-smoke',
    title: 'NWSL rivalry comeback has fans debating the final play',
    description: 'Women soccer rivalry with a fan reaction payoff.',
    video_url: 'https://www.youtube.com/watch?v=MOMENTSMOKE',
    thumbnail_url: 'https://example.com/thumb.jpg',
    published_at: new Date().toISOString(),
    source_channel_id: 'source-women',
  }
  const transcript = {
    id: 'transcript-moment-smoke',
    transcript_source: 'fixture',
    language: 'en',
    transcript_text: '',
    transcript_json: [
      { start: 0, duration: 4, end: 4, text: 'Everyone is laughing because the rookie called out the rivalry right away.' },
      { start: 4, duration: 5, end: 9, text: 'The fans are already debating whether that was confidence or pure chaos.' },
      { start: 9, duration: 7, end: 16, text: 'She said the pressure makes the goal feel even bigger for this team.' },
      { start: 40, duration: 4, end: 44, text: 'Then the captain answered with a record finish in front of the crowd.' },
      { start: 44, duration: 6, end: 50, text: 'No way anyone expected that turnaround after the slow first half.' },
      { start: 50, duration: 6, end: 56, text: 'The timeline is going to argue about this highlight all night.' },
      { start: 90, duration: 5, end: 95, text: 'The coach said this championship moment belongs to the fans.' },
      { start: 95, duration: 6, end: 101, text: 'It is emotional because the team made history with that final play.' },
      { start: 101, duration: 6, end: 107, text: 'That is the kind of achievement people share before the next match.' },
    ],
  }

  const candidates = buildTikTokClipCandidates(video, transcript, {
    targetChannelId: 'a1000000-0000-0000-0000-000000000004',
    now: () => new Date('2026-07-13T12:00:00.000Z'),
  })
  const previousAiMomentAnalystEnv = process.env.RBHQ_AI_MOMENT_ANALYST
  delete process.env.RBHQ_AI_MOMENT_ANALYST
  const deterministicWithAnalystOff = await buildMomentCandidatesWithOptionalAiAnalyst(video, transcript, {
    targetChannelId: 'a1000000-0000-0000-0000-000000000004',
    lane: 'rb_women',
    source: { name: 'Fixture Source', type: 'youtube_rss', url: video.video_url },
    viralSignals: [{ key: 'fan_reaction', label: 'fan reaction' }],
    now: () => new Date('2026-07-13T12:00:00.000Z'),
  })
  if (previousAiMomentAnalystEnv === undefined) {
    delete process.env.RBHQ_AI_MOMENT_ANALYST
  } else {
    process.env.RBHQ_AI_MOMENT_ANALYST = previousAiMomentAnalystEnv
  }

  assert.ok(candidates.length >= 1 && candidates.length <= 3)
  assert.deepEqual(deterministicWithAnalystOff.candidates, candidates)
  assert.equal(deterministicWithAnalystOff.mode, 'off')
  assert.equal(deterministicWithAnalystOff.fallbackUsed, true)
  assert.equal(deterministicWithAnalystOff.safety.liveAiCalls, false)
  assert.equal(candidates[0]?.target_channel_id, 'a1000000-0000-0000-0000-000000000004')
  assert.equal(candidates[0]?.score_breakdown.model, TIKTOK_MOMENT_RECOMMENDATION_MODEL)
  assert.equal(candidates[0]?.score_breakdown.role, 'primary')
  assert.equal(candidates[0]?.score_breakdown.operatorSelection, null)
  assert.ok(candidates.every((candidate) => candidate.start_seconds !== null && candidate.end_seconds !== null))
  for (let index = 0; index < candidates.length; index += 1) {
    for (let next = index + 1; next < candidates.length; next += 1) {
      assert.equal(overlaps(candidates[index], candidates[next]), false)
    }
  }

  const mockReranked = await buildMomentCandidatesWithOptionalAiAnalyst(video, transcript, {
    targetChannelId: 'a1000000-0000-0000-0000-000000000004',
    lane: 'rb_women',
    source: { name: 'Fixture Source', type: 'youtube_rss', url: video.video_url },
    viralSignals: [{ key: 'fan_reaction', label: 'fan reaction' }],
    mode: 'mock',
    provider: createMockAiMomentAnalystProvider({ selectedRank: 2 }),
    now: () => new Date('2026-07-13T12:00:00.000Z'),
  })
  if (candidates.length > 1) {
    assert.equal(mockReranked.candidates[0].start_seconds, candidates[1].start_seconds)
    assert.equal(mockReranked.candidates[0].score_breakdown.role, 'primary')
    assert.equal(mockReranked.candidates[0].score_breakdown.rank, 1)
    assert.equal((mockReranked.candidates[0].score_breakdown.aiMomentAnalyst as Record<string, unknown>).mode, 'mock')
    assert.equal(mockReranked.fallbackUsed, false)
  }
  assert.equal(mockReranked.safety.liveAiCalls, false)

  const invalidMock = await buildMomentCandidatesWithOptionalAiAnalyst(video, transcript, {
    targetChannelId: 'a1000000-0000-0000-0000-000000000004',
    lane: 'rb_women',
    source: { name: 'Fixture Source', type: 'youtube_rss', url: video.video_url },
    viralSignals: [{ key: 'fan_reaction', label: 'fan reaction' }],
    mode: 'mock',
    provider: createMockAiMomentAnalystProvider({ invalid: true }),
    now: () => new Date('2026-07-13T12:00:00.000Z'),
  })
  assert.deepEqual(invalidMock.candidates, candidates)
  assert.equal(invalidMock.fallbackUsed, true)
  assert.match(invalidMock.fallbackReason ?? '', /invalid_ai_output/)
  assert.equal(invalidMock.safety.liveAiCalls, false)

  const accepted = buildOperatorMomentSelectionUpdate({
    candidate: {
      id: 'candidate-primary',
      start_seconds: candidates[0].start_seconds,
      end_seconds: candidates[0].end_seconds,
      score_breakdown: candidates[0].score_breakdown,
    },
    selectedBy: 'smoke',
    now: () => new Date('2026-07-13T12:05:00.000Z'),
  })
  assert.equal(accepted.result.decision, 'accepted')
  assert.equal(accepted.update.status, 'approved_for_handoff')
  assert.equal((accepted.update.score_breakdown.operatorSelection as Record<string, unknown>).acceptedRecommendation, true)

  const overridden = buildOperatorMomentSelectionUpdate({
    candidate: {
      id: 'candidate-primary',
      start_seconds: candidates[0].start_seconds,
      end_seconds: candidates[0].end_seconds,
      score_breakdown: candidates[0].score_breakdown,
    },
    selectedStartSeconds: Number(candidates[0].start_seconds) + 0.5,
    selectedEndSeconds: Number(candidates[0].end_seconds) - 0.5,
    selectedBy: 'smoke',
    now: () => new Date('2026-07-13T12:06:00.000Z'),
  })
  assert.equal(overridden.result.decision, 'overridden')
  assert.equal((overridden.update.score_breakdown.operatorSelection as Record<string, unknown>).acceptedRecommendation, false)
  assert.equal((overridden.update.score_breakdown.momentRecommendation as Record<string, unknown>).aiRecommendedStartSeconds, candidates[0].start_seconds)

  console.log(JSON.stringify({
    result: 'PASS',
    recommendations: candidates.map((candidate) => ({
      role: candidate.score_breakdown.role,
      start: candidate.start_seconds,
      end: candidate.end_seconds,
      score: candidate.score,
      momentType: candidate.score_breakdown.momentType,
      contextBurden: candidate.score_breakdown.contextBurden,
      reason: candidate.score_breakdown.shortReason,
    })),
    selection: {
      accepted: accepted.result.decision,
      overridden: overridden.result.decision,
    },
    aiMomentAnalyst: {
      defaultMode: deterministicWithAnalystOff.mode,
      defaultFallbackUsed: deterministicWithAnalystOff.fallbackUsed,
      mockMode: mockReranked.mode,
      mockFallbackUsed: mockReranked.fallbackUsed,
      mockSelectedStart: mockReranked.candidates[0]?.start_seconds ?? null,
      invalidFallbackReason: invalidMock.fallbackReason,
    },
    safety: {
      liveAiCalls: false,
      networkCalls: 0,
      downloadsVideo: false,
      rendersVideo: false,
      uploadsVideo: false,
      postsVideo: false,
      triggersTikTokDryRun: false,
      clicksFinalPost: false,
      livePublish: false,
    },
  }, null, 2))
}

void main().catch((error) => {
  console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
