# Lane Replication Checklist

Use this checklist to copy the proven RB Women Phase 1 model into another RBHQ lane. Do not start a new lane by copying RB Women constants blindly. Each lane needs its own source bible, entity model, scoring language, caption voice, hashtag strategy, and QA fixtures.

The shared mechanics are proven:

- Source curation and source QA.
- RSS/source candidate ingestion.
- Intelligence V1 scoring.
- Daily Content Plan output.
- Moment selection.
- Clip Prep and Caption Prep.
- Local vertical rendering.
- ffprobe validation.
- Package attach.
- Retry-ready listing.
- Historical disabled source filtering.

## Replication Sequence

1. Define the lane source bible.
2. Add or confirm source priority metadata.
3. Add candidate filters for that lane.
4. Define recognizable entities.
5. Tune Intelligence V1 scoring and penalties.
6. Define caption voice and hashtag strategy.
7. Define Daily Plan labels and bucket limits.
8. Verify Clip Prep and render readiness rules.
9. Define historical/non-active source handling.
10. Add smoke coverage.
11. Run source QA and full validation.
12. Only then create real packages for strong candidates.

Do not touch TikTok posting while replicating a lane.

## 1. Source Bible

Each lane needs a curated source set before scoring can be trusted.

Document per source:

- Channel key.
- Display name.
- RSS URL or source URL.
- Target RBHQ channel id.
- Priority tier: core, useful, experimental, disabled, or noisy.
- Content use case.
- Known noise patterns.
- Whether it should be enabled for Phase 1.

Acceptance questions:

- Are all Phase 1 sources present in the DB?
- Are active config rows enabled in the DB?
- Are disabled/noisy rows disabled in the DB?
- Are historical sources retained but separated from current output?
- Does source QA report no missing seed or DB rows?

## 2. Source Priority Metadata

Each lane should attach source metadata to candidates during ingestion.

Customize:

- Source priority score.
- Source priority reason.
- Source category or content pillar.
- Active/non-active source flag.
- Noisy-source reason.

Do not rely on generic source names alone. Daily Plan, retry-ready reporting, and historical filtering need stable source keys.

## 3. Candidate Filters

Define what advances, holds, and rejects for the lane.

Customize:

- Strong title patterns.
- Useful source formats.
- Promo/ad patterns.
- Livestream handling.
- Long-form video handling.
- Duplicate or recycled content handling.
- Minimum person/team/event specificity.

The filter should reject obvious noise before it reaches operator review.

## 4. Player And Entity Extraction

Each lane needs its own entity list and precedence rules.

Customize:

- Players.
- Teams.
- Coaches.
- Fighters.
- Creators.
- Leagues.
- Events.
- Rivalries.
- Tournament names.

Extraction should prefer the title, source title, hook, and explicit metadata before broad body text. Stale generated copy must not override the entity centered in the actual title.

## 5. Scoring Weights

Do not reuse RB Women weights globally.

Customize boosts:

- Recognizable entity.
- Current relevance.
- Visual quality.
- Debate potential.
- Strong quote.
- Rivalry or matchup.
- Clutch or highlight value.
- Narrative tension.
- Search relevance.
- Fan conversation potential.

Customize penalties:

- Generic announcements.
- Weak first two seconds.
- No clear entity.
- No clear footage or quote.
- Sponsor/promo content.
- Long context burden.
- Stale candidate.
- No useful 10-45 second segment.

Each lane should have fixtures for:

- Must Post/Post Now.
- Develop/Maybe.
- Hold.
- Reject.
- A stale metadata drift case.

## 6. Caption Voice

Define lane voice explicitly.

For each lane, document:

- Tone.
- Pacing.
- Debate style.
- How direct the caption can be.
- What language to avoid.
- When to lead with evidence.
- When to lead with personality, rivalry, or stakes.

The caption should sound native to the lane, not copied from RB Women.

## 7. Hashtag Strategy

Each lane needs stable hashtag rules.

Customize:

- Lane hashtag.
- League hashtag.
- Team hashtag.
- Player/entity hashtag.
- Event hashtag.
- Debate or content-pillar hashtag.
- Maximum hashtag count.

Avoid overfitting to one viral term. Hashtags should help discovery while staying readable.

## 8. Daily Plan Labels

RB Women uses:

- `post_now`.
- `develop`.
- `hold`.

Another lane may keep those labels, but the meaning must be documented.

Define:

- Maximum candidates per cycle.
- Bucket order.
- What makes a candidate Post Now.
- What makes a candidate Develop.
- What makes a candidate Hold.
- What fields must be displayed.

Required Daily Plan fields:

- Source/title.
- Player/entity or equivalent lane entity.
- Lane angle.
- Score.
- Scout or decision label.
- Why this should post now.
- Caption draft.
- Hashtag pack.
- Operator summary.
- Package/render status.
- Transcript/source status.
- Review reason for Develop/Hold.

## 9. Package And Render Readiness

Use the shared render mechanics unless a lane proves a different requirement with tests.

Each lane must define:

- Whether metadata-only Clip Prep can ever become retry-ready.
- Whether manual ranges are allowed.
- Minimum and maximum clip length.
- Required local render validation.
- Whether subtitles are required or optional.
- Whether source download is allowed.
- Whether attached packages are included in current retry-ready output.

Default safe rules:

- Prefer transcript-backed Clip Prep.
- Require a useful 10-45 second segment for short-form packages.
- Attach only after local render validation.
- Do not claim burned subtitles when transcript segments are unavailable.
- Do not weaken other lanes when adding a lane-specific exception.

## 10. Historical Source Filtering

Every lane needs current-vs-historical source separation.

Rules:

- Do not delete historical candidates.
- Do not delete historical packages.
- Keep disabled-source packages available for audit.
- Current Daily Plan output should prefer active Phase 1 sources.
- Current retry-ready output should not be polluted by disabled historical sources.
- Reports should count historical/non-active packages separately.

## 11. Smoke Coverage

Add smoke tests before calling a lane complete.

Required smoke cases:

- Strong Post Now candidate with correct entity and angle.
- Develop candidate with clear review reason.
- Hold/reject noise candidate.
- Entity drift guard.
- Caption voice guard.
- Hashtag pack guard.
- Package/render status guard.
- Transcript metadata-only honesty guard.
- Historical disabled source filtering guard.

The smoke should prove no live AI calls, TikTok calls, uploads, posts, dry-run staging, or live publish behavior occurred.

## 12. Validation Commands

Run the lane source QA plus shared validation:

```bash
npm run source-system:<lane>
npm run smoke:source-ingestion
npx tsx scripts/smoke-intelligence-v1.ts
npm run smoke:moment-selection
npm run smoke:operator-queue-readiness
npm run smoke:batch-local-clip-generation
npm run smoke:clip-prep
npm run smoke:local-render-prep
npm run build
npx tsc --noEmit
npm run lint
```

If a lane-specific source QA command does not exist yet, add the smallest source-safe command needed to list, compare, and optionally sync sources with an explicit flag.

## Lane Order Recommendation

Recommended order after RB Women:

1. RB Sports.
2. RB Combat.
3. RB Arena.
4. RB Futbol.
5. RB CFB.

Rationale:

- RB Sports should be easiest next because source and content volume are high.
- RB Combat has strong clip potential but needs tighter niche source tuning.
- RB Arena needs gaming and esports-specific source logic.
- RB Futbol needs language and global-source handling.
- RB CFB needs seasonal source and scoring tuning.

## Completion Definition

A replicated lane is Phase 1 complete only when:

- Source QA is clean.
- Daily Plan returns usable Post Now / Develop / Hold or lane-equivalent buckets.
- Post Now has a clear entity, angle, caption, hashtags, why-now, and operator summary.
- Package/render status is accurate.
- At least one current lane item is ready for retry-ready handoff.
- Historical disabled packages do not pollute current retry-ready output.
- Validation passes.
- TikTok login, upload, dry-run staging, final Post click, posting, and live publish behavior remain untouched.
