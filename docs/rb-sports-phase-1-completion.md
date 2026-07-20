# RB Sports Phase 1 Completion Handoff

RB Sports Phase 1 is functionally complete for the non-posting RBHQ pipeline. It follows the RB Women blueprint for source curation, source QA, Intelligence V1 scoring, Daily Plan selection, Clip Prep, local vertical rendering, package attach, and retry-ready handoff, with RB Sports-specific scoring, voice, and entity extraction.

This handoff covers the validated non-posting system only. It does not authorize TikTok login, upload, dry-run staging, final Post clicks, posting, or live publish behavior.

## Accepted State

Current accepted commits on `origin/main`:

- `301287d Stabilize RB Sports repeatability QA`
- `ebde7c1 Fix RB Sports event entity extraction`
- `831509f Stabilize RB Sports World Cup entity focus`

Final acceptance state:

- Source QA: passed.
- Safe RB Sports RSS ingestion: proven.
- Daily Plan: passed.
- Post Now / Develop / Hold: working.
- RB Sports scoring and voice: working.
- Player, team, league, and event extraction: stabilized for Phase 1.
- Caption drafts: working.
- Hashtag packs: working.
- Why-this-should-post-now copy: working.
- Operator summaries: working.
- Package and render status: accurate.
- Retry-ready package: proven.
- Disabled/noisy sources: excluded from current RB Sports Daily Plan output.
- Posting layer: untouched.

RB Sports now satisfies the original RBHQ content-plan goal:

- Auto-ranking clips.
- Caption drafts.
- Hashtag packs.
- Why this should post now.
- Operator summaries.
- Daily Content Plan.
- Local render and package status.
- Retry-ready handoff.

## Proven Source Setup

RB Sports source configuration lives in `lib/rb-sports-source-config.ts`.

Validated source QA result:

- 12 active configured Phase 1 sources.
- 12 active seed rows.
- 29 RB Sports DB source rows.
- 12 enabled DB rows.
- No missing seed rows.
- No missing DB rows.
- No disabled active rows.
- No enabled non-active rows.
- No invalid seed URLs.

Active Phase 1 source set:

- NBA.
- NFL.
- MLB.
- NHL.
- ESPN.
- Bleacher Report.
- House of Highlights.
- CBS Sports.
- NBC Sports.
- Los Angeles Lakers.
- Kansas City Chiefs.
- Dallas Cowboys.

Disabled or noisy categories remain inactive by default:

- Sports Fan Reactions Discovery.
- Betting/Fantasy Watchlist.
- Longform Podcast Watchlist.

Historical data is retained for auditability. Disabled/noisy sources should not pollute current active Daily Plan or retry-ready output.

## Scouting Window

RB Sports uses a 48-hour default scouting window.

RB Sports also uses a 0-6 hour breaking urgency boost for clips with strong current signals:

- Breaking news.
- Trades and roster movement.
- Injuries and returns.
- Suspensions or lineup changes.
- Buzzer beaters, walk-offs, game winners, or late-game moments.
- Controversial calls.
- Playoff or rivalry moments.

RB Sports moves faster than RB Women because mainstream sports clips age quickly. Stale clips should be held unless they still have active game, transaction, playoff, injury, or debate context.

## Daily Plan Labels

RB Sports Daily Plans default to no more than three candidates per cycle:

- `post_now`: strongest current item, ideally packaged or clearly packageable.
- `develop`: promising item needing human review, package work, transcript timing, segment selection, or angle confirmation.
- `hold`: stale, noisy, promotional, generic, or weak item with a clear review reason.

Final real Daily Plan acceptance sample:

| Bucket | Candidate | Result |
| --- | --- | --- |
| Post Now | NBA, Nuggets vs Raptors Las Vegas Summer League full game highlights | Passed |
| Develop | CBS Sports, Spain takes down Argentina to win 2026 FIFA World Cup | Passed |
| Hold | NFL, Baker Mayfield Top 100 Players of 2026 | Passed |

## RB Sports Angles

RB Sports uses fan-first, direct, debate-friendly angles:

- Breaking reaction.
- Clutch proof.
- Bad call / officiating heat.
- Rivalry heat.
- Trade / roster movement.
- Injury / return.
- Playoff stakes.
- Star performance.
- Upset reaction.
- Coach/player quote.
- Fan debate.
- Highlight evidence.

Accepted behavior:

- Nuggets/Raptors Summer League centers `Nuggets` as the team entity.
- Lionel Messi World Cup titles center `Lionel Messi` as the player entity when present.
- Spain and Argentina are treated as team/matchup context, not player names.
- FIFA World Cup, World Cup, Summer League, Peach Jam, MLB Season, and Las Vegas are not promoted to `playerEntity`.
- Baker Mayfield still maps as `playerEntity`.
- Betting, fantasy, schedule, ranking, podcast, and filler content stays Hold or Reject.

## Entity Extraction Requirements

RB Sports extraction supports:

- Players.
- Teams.
- Coaches.
- Leagues.
- Event context.
- Transaction and injury terms.

Extraction must keep source/title focus stable:

- If the title centers a player, copy should center that player.
- If the title centers a team, copy should center that team.
- If the title centers a league or event, that context should not become a player.
- If stored candidate copy has stale event-subject drift, Daily Plan output should sanitize the subject without weakening stored score/package status.

The final World Cup-style edge case is fixed:

- `Lionel Messi` extracts as `playerEntity`.
- `Spain` and `Argentina` are team/matchup context.
- `FIFA World Cup`, `World Cup`, and show/event suffixes do not become `playerEntity`.

## Noise Filtering

Prioritize:

- Clutch plays.
- Bad calls and officiating disputes.
- Rivalries.
- Injuries and returns.
- Trades and roster movement.
- Playoff stakes.
- Coach and player pressers.
- Fan debate moments.
- Star performances.
- Upset or loss reactions.

Deprioritize or reject:

- Betting-only content.
- Fantasy-only content.
- Generic rankings.
- Schedule filler.
- Long podcasts without timestamps.
- Evergreen debate clips.
- Low-context highlight dumps.
- Sponsor, ticket, merch, or promo filler.

## Package And Render Proof

The proven non-posting package flow is:

1. Ingest actual RB Sports source candidates.
2. Score with RB Sports Intelligence V1.
3. Select a Daily Plan candidate.
4. Choose or verify a useful 10-45 second range.
5. Refresh Clip Prep and Caption Prep.
6. Render local 1080x1920 vertical asset.
7. Validate with ffprobe.
8. Attach only after validation.
9. List as retry-ready only when readiness rules pass.

Accepted Post Now package:

- Candidate: NBA, Nuggets vs Raptors Las Vegas Summer League full game highlights.
- Candidate ID: `c3acfc99-dae0-4125-9f8d-17c420851810`.
- Package ID: `f510ce81-e207-491d-8f0f-ac4a9537a0f2`.
- Team entity: `Nuggets`.
- RB angle: `star performance`.
- Score: `84`.
- Scout label: `post_now`.
- Range: `0-30s`.
- Render: attached.
- Local asset validation: verified.
- Asset: 1080x1920, h264, yuv420p, AAC audio, 30.013s.
- Operator state: `ready_for_tiktok_retry`.
- Transcript status: `metadata_only`.

## Retry-Ready Rules

RB Sports does not copy the RB Women metadata-only readiness exception globally.

Current accepted RB Sports retry-ready proof depends on:

- A real package row.
- A defensible manual range.
- A local render attached to the package.
- Local asset validation.
- Honest transcript status.
- No TikTok staging, upload, post, or live publish behavior.

Do not treat metadata-only transcript status as burned subtitles. Metadata-only means timed transcript segments are unavailable.

## Transcript Limitations

Transcript coverage remains limited.

Current behavior is correct:

- Timed transcripts are preferred when available.
- Metadata-only clips keep `subtitle_source: metadata_only`.
- Metadata-only clips keep `transcriptTimed: false`.
- Metadata-only clips do not claim burned subtitles.
- Package/render status remains independent from subtitle burn status.

RB Sports Phase 1 is complete for non-posting Daily Plan and retry-ready handoff, but better timed transcript ingestion would improve burned-subtitle coverage and operator confidence.

## Difference From RB Women

RB Sports differs from RB Women in important ways:

- RB Sports uses a 48-hour scouting window; RB Women uses 72 hours.
- RB Sports has a 0-6 hour breaking urgency boost.
- RB Sports source volume is higher, so noisy source filtering is stricter.
- RB Sports entity extraction must handle teams, leagues, events, transactions, injuries, and coaches in addition to players.
- RB Sports does not inherit RB Women metadata-only retry-ready behavior as a global lane rule.
- RB Sports voice is fan-first and debate-friendly, but not fake-hot-take.

## Completion Criteria

RB Sports Phase 1 is accepted when:

- Source QA is clean.
- Daily Plan returns usable Post Now / Develop / Hold.
- Post Now has a clear entity, angle, caption, hashtags, why-now, and operator summary.
- Package/render status is accurate.
- Transcript status is honest.
- At least one current RB Sports item is `ready_for_tiktok_retry`.
- Disabled/noisy sources do not appear in current RB Sports output.
- Event phrases are not misclassified as player entities.
- No TikTok login, upload, dry-run staging, final Post click, posting, or live publish behavior occurs.

## Validation Commands

The accepted Phase 1 state should be validated with:

```bash
npm run source-system:rb-women
npm run source-system:rb-sports
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

## Safety Boundary

RB Sports Phase 1 completion does not change the posting boundary.

Do not run from this handoff:

- TikTok login.
- TikTok upload.
- TikTok dry-run staging.
- Final Post click.
- Live publish behavior.
- Posting automation.

The posting layer remains intentionally paused for this Phase 1 non-posting pipeline.
