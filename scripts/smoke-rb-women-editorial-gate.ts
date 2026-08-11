import {
  evaluateRBWomenCandidates,
  type RBWomenEditorialCandidateInput,
} from '../lib/rb-women-channel-profile'
import {
  finalCopyForCandidate,
  type SelectedOpusCandidate,
} from '../lib/rb-women-opus-pipeline'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function baseCandidate(overrides: Partial<RBWomenEditorialCandidateInput>): RBWomenEditorialCandidateInput {
  return {
    start_seconds: 10,
    end_seconds: 38,
    transcript_summary: 'A clear women’s basketball moment.',
    opening_line: 'She said exactly what changed the game.',
    subject: 'A women’s basketball subject',
    visual_context: 'Press room podium with team backdrop.',
    rb_women_angle: 'Player accountability and competitive edge.',
    viral_reason: 'Fans are debating the quote.',
    confidence: 0.9,
    womens_basketball_primary_subject: true,
    competition: 'WNBA',
    primary_subject_type: 'player',
    primary_subject_names: ['A’ja Wilson'],
    team_names: ['Las Vegas Aces'],
    player_names: ['A’ja Wilson'],
    coach_names: [],
    event_type: 'press_conference',
    moment_type: 'press_conference_quote',
    rb_women_lanes: ['competition', 'star treatment'],
    standalone_context: true,
    why_fans_care: 'A star player gave a direct accountability quote.',
    audience_fit_reason: 'Direct, fan-native, and grounded in competition.',
    source_reliability: 95,
    timeliness: 90,
    visual_action_score: 50,
    emotional_stakes_score: 85,
    debate_score: 70,
    personality_score: 65,
    undercovered_story_score: 70,
    editorial_fit_score: 90,
    eligibility: true,
    rejection_codes: [],
    ...overrides,
  }
}

function testNegativeMensBowlingSource() {
  const result = evaluateRBWomenCandidates([
    baseCandidate({
      transcript_summary: 'A female reporter interviews male bowlers after a PBA match.',
      opening_line: 'How did you handle the pressure in the tenth frame?',
      subject: 'Male bowlers react to a PBA final.',
      visual_context: 'Female reporter standing next to male bowlers at the lanes.',
      rb_women_angle: 'A woman is conducting the interview.',
      viral_reason: 'Bowling fans care about the men’s final.',
      womens_basketball_primary_subject: false,
      competition: 'PBA_MENS_BOWLING',
      primary_subject_type: 'reporter',
      primary_subject_names: ['Female reporter', 'Male bowler'],
      team_names: [],
      player_names: [],
      coach_names: [],
      event_type: 'postgame_interview',
      moment_type: 'press_conference_quote',
      rb_women_lanes: [],
      why_fans_care: 'Men’s bowling result.',
      audience_fit_reason: 'Not a women’s basketball audience fit.',
      eligibility: false,
      rejection_codes: [],
    }),
  ])

  assert(result.eligible.length === 0, 'Men’s bowling source produced an eligible RB Women candidate.')
  assert(result.rejected.length === 1, 'Men’s bowling source should produce one rejected evaluation.')
  const codes = result.rejected[0]?.rejectionCodes ?? []
  assert(
    codes.includes('REJECT_MENS_COMPETITION') || codes.includes('REJECT_ADJACENT_WOMAN_ONLY'),
    `Expected men’s competition or adjacent-woman-only rejection; got ${codes.join(',')}`,
  )
}

function testPositiveInterviewFixture() {
  const result = evaluateRBWomenCandidates([
    baseCandidate({
      opening_line: 'A’ja Wilson said the Aces have to own the fourth quarter.',
      subject: 'A’ja Wilson postgame accountability quote.',
      player_names: ['A’ja Wilson'],
      primary_subject_names: ['A’ja Wilson'],
      team_names: ['Las Vegas Aces'],
      moment_type: 'press_conference_quote',
      rb_women_lanes: ['competition', 'star treatment'],
    }),
  ])

  const item = result.eligible[0]
  assert(item, 'Positive interview fixture was rejected.')
  assert(item.candidate.primary_subject_names.includes('A’ja Wilson'), 'Interview fixture lost player entity.')
  assert(item.candidate.competition === 'WNBA', 'Interview fixture competition mismatch.')
  assert(!/reporter/i.test(item.candidate.primary_subject_type), 'Interview fixture framed the reporter as primary subject.')
}

function testPositiveGameFixture() {
  const result = evaluateRBWomenCandidates([
    baseCandidate({
      start_seconds: 42,
      end_seconds: 68,
      transcript_summary: 'Paige Bueckers creates separation and hits the late shot.',
      opening_line: 'Paige made the defense pay on that switch.',
      subject: 'Paige Bueckers late-game shot.',
      visual_context: 'Game action shows the dribble move, shot, result, and crowd reaction.',
      competition: 'WNBA',
      primary_subject_names: ['Paige Bueckers'],
      player_names: ['Paige Bueckers'],
      team_names: ['Dallas Wings'],
      event_type: 'game_highlight',
      moment_type: 'clutch_sequence',
      rb_women_lanes: ['competition', 'player personality'],
      visual_action_score: 96,
      emotional_stakes_score: 92,
    }),
  ])

  const item = result.eligible[0]
  assert(item, 'Positive game fixture was rejected.')
  assert(item.candidate.moment_type === 'clutch_sequence', 'Game fixture did not preserve action moment type.')
  assert(item.namedSearchEntities.includes('Paige Bueckers'), 'Game fixture missing player search entity.')
}

function testPositiveBehindTheScenesFixture() {
  const result = evaluateRBWomenCandidates([
    baseCandidate({
      start_seconds: 12,
      end_seconds: 34,
      transcript_summary: 'Unrivaled teammates joke through a shooting contest.',
      opening_line: 'That teammate chemistry is why this works.',
      subject: 'Unrivaled player chemistry in practice.',
      visual_context: 'Players laughing and competing during a practice shooting game.',
      competition: 'Unrivaled',
      primary_subject_names: ['Napheesa Collier', 'Breanna Stewart'],
      player_names: ['Napheesa Collier', 'Breanna Stewart'],
      team_names: ['Unrivaled'],
      event_type: 'behind_the_scenes',
      moment_type: 'behind_the_scenes',
      rb_women_lanes: ['player personality', 'style and culture'],
      visual_action_score: 78,
      personality_score: 95,
      emotional_stakes_score: 70,
    }),
  ])

  const item = result.eligible[0]
  assert(item, 'Positive behind-the-scenes fixture was rejected.')
  assert(item.candidate.competition === 'Unrivaled', 'Behind-the-scenes fixture competition mismatch.')
  assert(item.rbWomenLane === 'player personality', 'Behind-the-scenes fixture lane mismatch.')
}

function selectedCandidateFixture(overrides: Partial<RBWomenEditorialCandidateInput>): SelectedOpusCandidate {
  const candidate = baseCandidate(overrides)
  const editorial = evaluateRBWomenCandidates([candidate]).eligible[0]
  assert(editorial, 'Selected fixture must be eligible.')
  return {
    ...candidate,
    editorial,
    rank: 1,
    paddedStartSeconds: candidate.start_seconds,
    paddedEndSeconds: candidate.end_seconds,
    sceneAdjustedStartSeconds: candidate.start_seconds,
    sceneAdjustedEndSeconds: candidate.end_seconds,
  }
}

function testConfirmedPlayerNameSurvivesFinalCopy() {
  const selected = selectedCandidateFixture({
    opening_line: 'Paige Bueckers gets downhill and finishes through contact.',
    subject: 'Paige Bueckers driving finish.',
    visual_context: 'Paige Bueckers attacks the paint and finishes over help defense.',
    primary_subject_names: ['Paige Bueckers'],
    player_names: ['Paige Bueckers'],
    team_names: ['Dallas Wings'],
    event_type: 'game_highlight',
    moment_type: 'dominant_play',
  })
  const copy = finalCopyForCandidate({
    selected,
    hashtags: ['#PaigeBueckers', '#WNBA', '#BasketballHighlights', '#RunnitBackWomen', '#BasketballIQ'],
    sourceTitle: 'Dallas Wings vs. Golden State Valkyries highlights',
    transcriptText: 'Bueckers gets downhill and finishes through contact.',
  })

  assert(copy.title.includes('Paige Bueckers') || copy.title.includes('Bueckers'), 'Confirmed player name was removed.')
  assert(copy.resolution.entityConfidence['Paige Bueckers'] === 'high', 'Confirmed player did not resolve high confidence.')
}

function testUnconfirmedPlayerNameIsRemovedFromFinalCopy() {
  const selected = selectedCandidateFixture({
    opening_line: 'Janelle Salaun hits the tough shot through traffic.',
    subject: 'A tough WNBA shot through traffic.',
    visual_context: 'A player rises over defenders and hits a difficult jumper.',
    primary_subject_names: [],
    player_names: [],
    team_names: ['Golden State Valkyries'],
    event_type: 'game_highlight',
    moment_type: 'dominant_play',
  })
  const copy = finalCopyForCandidate({
    selected,
    hashtags: ['#WNBA', '#WomenSports', '#RunnitBackWomen', '#BasketballIQ', '#WomensBasketball'],
    sourceTitle: 'Golden State Valkyries vs. Dallas Wings highlights',
    transcriptText: 'Salaun hits the tough shot through traffic.',
  })

  assert(!/Janelle|Salaun|Salaün/i.test(copy.title), 'Unconfirmed player name survived title QA.')
  assert(!/Janelle|Salaun|Salaün/i.test(copy.caption), 'Unconfirmed player name survived caption QA.')
}

function main() {
  testNegativeMensBowlingSource()
  testPositiveInterviewFixture()
  testPositiveGameFixture()
  testPositiveBehindTheScenesFixture()
  testConfirmedPlayerNameSurvivesFinalCopy()
  testUnconfirmedPlayerNameIsRemovedFromFinalCopy()

  console.log(JSON.stringify({
    result: 'PASS',
    cases: [
      'negative_mens_bowling_zero_eligible',
      'positive_interview_entities',
      'positive_game_action_entities',
      'positive_behind_the_scenes_context',
      'confirmed_player_name_survives_final_copy',
      'unconfirmed_player_name_removed_from_final_copy',
    ],
    safety: {
      persistsCandidates: false,
      uploadsToR2: false,
      callsMetricool: false,
    },
  }, null, 2))
}

try {
  main()
} catch (error) {
  console.error(JSON.stringify({
    result: 'FAIL',
    error: error instanceof Error ? error.message : String(error),
  }, null, 2))
  process.exitCode = 1
}
