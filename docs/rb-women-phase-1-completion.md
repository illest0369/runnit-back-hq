# RB Women Phase 1 Completion Handoff

RB Women Phase 1 is functionally complete for the non-posting RBHQ pipeline. It is now the blueprint lane for source curation, Intelligence V1 scoring, Daily Plan selection, Clip Prep, local vertical rendering, package attach, and retry-ready handoff.

This handoff covers the validated non-posting system only. It does not authorize TikTok login, upload, dry-run staging, final Post clicks, posting, or live publish behavior.

## Accepted State

Current accepted commits on `origin/main`:

- `948a833 Stabilize RB Women Daily Plan metadata and copy focus`
- `436fe69 Wire RB Women source candidates into Daily Plan acceptance`

Final acceptance state:

- Source QA: passed.
- Daily Plan: passed.
- Post Now / Develop / Hold: working.
- Player and entity focus: fixed.
- RB angle selection: fixed.
- Caption drafts: working.
- Hashtag packs: working.
- Why-this-should-post-now copy: working.
- Operator summaries: working.
- Package and render status: accurate.
- Retry-ready package: proven.
- Historical disabled sources: filtered from current active retry-ready output.
- Posting layer: untouched.

RB Women now satisfies the original RBHQ content-plan goal:

- Auto-ranking clips.
- Caption drafts.
- Hashtag packs.
- Why this should post now.
- Operator summaries.
- Daily Content Plan.
- Local render and package status.
- Retry-ready handoff.

## Proven Source Setup

RB Women source configuration lives in `lib/rb-women-source-config.ts`.

Validated source QA result:

- 21 RB Women source rows in the database.
- 16 enabled active Phase 1 sources.
- No missing seed rows.
- No missing DB rows.
- No disabled active rows.
- No enabled non-active rows.
- No invalid seed URLs.
- Noisy soccer/general sources disabled or marked non-active for Phase 1.

Active Phase 1 source set:

- WNBA.
- Unrivaled Basketball.
- Indiana Fever.
- Dallas Wings.
- Minnesota Lynx.
- Las Vegas Aces.
- New York Liberty.
- Chicago Sky.
- Los Angeles Sparks.
- Phoenix Mercury.
- Seattle Storm.
- Atlanta Dream.
- Just Women's Sports.
- WNBA on NBC.
- TNT Sports US.
- All Women's Sports Network.

Historical or noisy sources remain in the DB for auditability, but are not allowed to pollute current active RB Women retry-ready output.

## Scouting Window

RB Women uses a 72-hour scouting window.

The longer window is intentional because RB Women clips often need more operator judgment than a generic 0-48 hour sports trend window. The system should still prefer fresher clips when scores and package readiness are otherwise similar.

## Daily Plan Labels

RB Women Daily Plans default to no more than three candidates per cycle:

- `post_now`: strongest current item, ideally packaged or clearly packageable.
- `develop`: promising item needing more operator review, package work, transcript timing, or editorial confirmation.
- `hold`: held or rejected item with a clear review reason.

Final real Daily Plan acceptance sample:

| Bucket | Candidate | Result |
| --- | --- | --- |
| Post Now | Kelsey Mitchell EXPLODES for 33 PTS On Second Night of Back-to-Back WINS | Passed |
| Develop | Caitlin Clark drops 45 points, reaches 200 career 3-pointers | Passed |
| Hold | Sue Bird has high praise for Olivia Miles | Passed |

## RB Angles

RB Women uses broad editorial angles, not only race-centered framing:

- Race and representation.
- Media power.
- Unequal visibility.
- Star treatment.
- Labor and leadership.
- Credit distribution.
- Who gets protected or criticized.
- Popularity versus production.
- Basketball evidence.

Accepted behavior:

- Kelsey Mitchell production clips center Kelsey, not Caitlin Clark.
- Paige Bueckers point-production clips center Paige.
- Caitlin assist clips can use credit distribution when the title or entities actually support that framing.
- Routine promos, sponsor content, schedule announcements, and generic league updates remain Hold or Reject.

## Scoring Behavior

Prioritize:

- Recognizable players.
- Matchups.
- Strong quotes.
- Foul and officiating disputes.
- Player callouts.
- Veteran-vs-rookie or player-vs-player angles.
- Press conference reactions.
- Major highlights.
- Media narratives.
- Personality and culture moments.
- Basketball evidence.

Deprioritize:

- Ticket promos.
- Sponsor ads.
- Schedule announcements.
- Merch promos.
- Community appearances without a story.
- Long livestreams without timestamps.
- Routine practice footage.
- Broad women's sports news without a clear person-centered angle.

The Daily Plan must expose the score and must keep score meaning aligned with the selected scout label. A high numeric score can still produce `develop` or `hold` when the candidate lacks a verified segment, package, clear footage, or defensible RB angle.

## Package And Render Flow

The proven non-posting flow is:

1. Ingest actual RB Women source candidates.
2. Score with RB Women Intelligence V1.
3. Select Daily Plan candidate.
4. Choose or verify a 10-45 second range.
5. Refresh Clip Prep and Caption Prep.
6. Render local 1080x1920 vertical asset.
7. Validate with ffprobe.
8. Attach only after validation.
9. List as retry-ready only when readiness rules pass.

Accepted Post Now package:

- Candidate: Kelsey Mitchell EXPLODES for 33 PTS On Second Night of Back-to-Back WINS.
- Package ID: `95a809c9-594a-4fb1-807a-c5ce9f0bbf54`.
- Player entity: `Kelsey Mitchell`.
- RB angle: `basketball evidence`.
- Score: `100`.
- Scout label: `post_now`.
- Range: `0-30s`.
- Render: attached.
- Local asset validation: verified.
- Operator state: `ready_for_tiktok_retry`.
- Transcript status: `metadata_only`.

## Retry-Ready Rules

RB Women retry-ready behavior is intentionally narrow:

- RB Women metadata-only packages can become retry-ready only when an operator/manual range exists.
- The range must be useful, currently validated as 10-45 seconds.
- A local render must exist and be attached.
- The local render must pass validation.
- Metadata-only transcript state must remain explicit.
- Metadata-only must not claim burned subtitles.
- Other lanes are not weakened by RB Women metadata-only readiness rules.

Accepted retry-ready state:

- Current active RB Women retry-ready count: 5.
- Historical disabled NWSL package is separated as historical/non-active.
- Historical disabled packages are not deleted.
- Historical disabled packages do not pollute current active RB Women retry-ready output.

## Transcript Limitations

Transcript coverage is the remaining reason RB Women Phase 1 is not considered 100 percent complete.

Current behavior is correct:

- Timed transcripts are preferred.
- Transcript-backed clips can burn subtitles when timed transcript segments exist.
- Metadata-only clips keep `subtitle_source: metadata_only`.
- Metadata-only clips keep `transcriptTimed: false`.
- Metadata-only clips do not claim burned subtitles.
- Subtitle burn safely skips metadata-only clips.

The system is ready for Daily Plan and retry-ready handoff without broad transcript coverage, but stronger transcript ingestion would improve burned-subtitle coverage and operator confidence.

## Disabled Historical Source Handling

Historical data is retained. Do not delete historical candidates or packages just because a source is now disabled for Phase 1.

Current behavior:

- Disabled/noisy sources remain visible to source QA as non-active.
- Current RB Women Daily Plan and retry-ready views prefer active Phase 1 sources.
- Disabled historical retry-ready packages are counted separately as historical/non-active.
- NWSL historical package proof remains audit data, not current RB Women Phase 1 output.

## Validation Commands

The accepted Phase 1 state was validated with:

```bash
npm run source-system:rb-women
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

All commands passed during acceptance QA.

## Safety Boundary

RB Women Phase 1 completion does not change the posting boundary.

Do not run from this handoff:

- TikTok login.
- TikTok upload.
- TikTok dry-run staging.
- Final Post click.
- Live publish behavior.
- Posting automation.

The posting layer has been proven once separately, but it remains intentionally paused for this Phase 1 non-posting pipeline.
