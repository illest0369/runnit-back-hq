# RB Sports Phase 1 Replication Plan

RB Sports is the next lane to replicate from the completed RB Women Phase 1 blueprint. This document is planning only. It does not add RB Sports source config, seed rows, scoring code, smoke fixtures, render behavior, TikTok login, upload, dry-run staging, final Post clicks, posting, or live publish behavior.

RB Sports channel metadata already exists in the app:

- Channel key: `rb_sports`.
- Channel id: `a1000000-0000-0000-0000-000000000001`.
- Label: `RB Sports`.
- Handle: `@runnitbacksports`.

## Blueprint To Reuse

Reuse the proven RB Women mechanics:

- Source curation and source QA before trusting Daily Plan output.
- RSS/source candidate ingestion with source metadata attached to candidates.
- Intelligence V1 scoring that produces score, why-now, caption, hashtags, and operator summary.
- Daily Plan selection with a small operator-readable candidate set.
- Moment selection, Clip Prep, Caption Prep, local vertical rendering, ffprobe validation, package attach, and retry-ready listing.
- Current-vs-historical source filtering so disabled sources do not pollute current output.
- Metadata-only transcript honesty: no burned-subtitle claim without timed transcript segments.
- Strict separation from TikTok posting.

Do not copy RB Women editorial constants directly. RB Sports needs faster recency weighting, broader league/entity coverage, and a sharper breaking-news filter.

## Source Bible Needed

RB Sports Phase 1 should begin with a curated source bible before any code replication.

The source bible should define each source with:

- Channel key.
- Display name.
- RSS URL or source URL.
- Target RBHQ channel id: `a1000000-0000-0000-0000-000000000001`.
- Priority tier: `core`, `useful`, `experimental`, `disabled_noisy`.
- Primary league or sport coverage.
- Known noise patterns.
- Whether the source is active for Phase 1.

Recommended Phase 1 source categories:

- Official league highlight feeds for NBA, NFL, MLB, NHL, and major mixed-sport channels.
- Team feeds only where the team has reliable highlight, quote, or conflict output.
- Sports debate and desk-show clips when the title has a player, team, matchup, or quote angle.
- Player-centered interview and press conference feeds when clips are short or timestampable.
- Trusted broad-sports highlight channels with consistent YouTube RSS quality.
- Short-form-friendly recap feeds with titles that identify the player, team, score, or controversy.

Keep the initial Phase 1 source set smaller than the full sports universe. RB Sports has enough volume that source noise can overwhelm Daily Plan quality if every general sports feed is enabled at once.

## Source Priorities

Suggested priority meanings:

- `core`: Official league or high-signal highlight source with frequent player/team-specific clips.
- `useful`: Reliable sports media source with strong debate, reaction, interview, or breakdown clips.
- `experimental`: High-volume or mixed-quality source that may surface useful stories but needs stricter review.
- `disabled_noisy`: Source retained for audit/history or later testing, but excluded from current Daily Plan and retry-ready output.

Priority scoring should favor:

- Official highlights with clear player/team titles.
- Breaking injury, trade, suspension, lineup, and playoff news with direct fan stakes.
- Clutch plays, controversial calls, star reactions, rivalry moments, and press conference quotes.
- Clips with clear 10-45 second payoff potential.

Priority scoring should not blindly favor large general sports brands when the item is a generic show segment, long podcast, schedule read, gambling promo, or filler recap.

## Likely Noisy Source Categories

RB Sports will need stricter source filtering than RB Women because volume is higher.

Likely noisy categories:

- Betting odds, sportsbook promos, picks shows, and parlay segments.
- Fantasy waiver-wire content without a visible moment or player quote.
- Full games, long livestreams, and long podcasts without timestamps.
- Generic power rankings, schedule announcements, and standings updates.
- Merch, ticketing, sponsor, giveaway, or app-download promotions.
- Training camp or practice clips without a story.
- Draft-board speculation with no named conflict, quote, or transaction.
- Low-context compilation clips that do not identify the player or game.
- Broad morning-show segments where the title hides the actual clip angle.
- Recycled evergreen debate clips that are stale relative to current sports conversation.

Historical candidates from disabled or noisy sources should be retained, counted separately, and excluded from current active retry-ready output unless explicitly reactivated.

## Scout Labels

RB Sports can keep the same three-label Daily Plan structure:

- `post_now`: Strong current clip with clear player/team/entity, clear footage or quote, defensible RB Sports angle, useful 10-45 second segment, and honest package/render status.
- `develop`: Promising clip that needs human review, transcript timing, stronger segment selection, package/render work, or angle confirmation.
- `hold`: Noise, stale item, promo, weak title, missing entity, no clear footage/quote, or no defensible short-form payoff.

Default RB Sports Daily Plans should also limit to three candidates per cycle unless an explicit override is added later:

1. Post Now.
2. Develop.
3. Hold.

## RB Sports Content Angles

RB Sports voice should be fan-first, fast, direct, and evidence-led. It should sound like the timeline after a game, trade, call, quote, or ranking argument, not like a corporate recap.

Primary angles:

- Breaking reaction.
- Clutch proof.
- Star pressure.
- Rivalry heat.
- Bad call or officiating dispute.
- Trade or free-agency fallout.
- Injury impact.
- Playoff stakes.
- Upset alert.
- Locker-room or press-conference quote.
- Player accountability.
- Coach decision.
- Fan debate.
- Legacy or record watch.
- Popularity versus production.
- Highlight evidence.

The angle should come from the candidate itself. Do not force generic trade, legacy, or controversy framing when the title is just a clean highlight.

## Entity Extraction Needs

RB Sports needs broader entity extraction than RB Women.

Entity types:

- Players.
- Teams.
- Coaches.
- Leagues.
- Games and series.
- Rivalries.
- Awards and records.
- Transactions.
- Injuries.
- Referees or officials when the story is about a call.

Extraction precedence:

1. Candidate title.
2. Source title and source metadata.
3. Hook or recommended hook.
4. Explicit intelligence metadata.
5. Description/body text.
6. Fallback league/team inference.

The centered entity must not drift. If the title centers a player performance, generated copy should center that player. If the title centers a team collapse, generated copy should center the team. If the title centers a trade, generated copy should center the player/team transaction.

## Scoring Differences From RB Women

RB Sports should be more recency-sensitive than RB Women.

Recommended scouting window:

- Default window: 48 hours.
- Strong breaking window: 0-6 hours for trades, injuries, suspensions, buzzer beaters, playoff moments, and controversial calls.
- Hold or downrank stale candidates unless they remain tied to an active game, transaction, playoff series, or debate cycle.

Boost more heavily than RB Women:

- Breaking news.
- Fresh game result.
- Clear star or team entity.
- Clutch play or final possession.
- Controversial call.
- Trade/injury/suspension impact.
- Rivalry or playoff stakes.
- Fan debate potential.
- Clear 10-45 second visual payoff.

Penalize more heavily than RB Women:

- Stale titles.
- Long shows without timestamps.
- Betting/fantasy-only segments.
- Generic rankings.
- Weak entity extraction.
- No visible play, quote, or reaction.
- Overly broad multi-topic segments.
- Content that needs too much context before the payoff.

RB Women can tolerate a 72-hour scouting window because visibility and editorial context often need more operator judgment. RB Sports should move faster because mainstream sports clips age quickly.

## Caption And Hashtag Voice

Caption voice:

- Short, direct, and fan-native.
- Lead with the player, team, play, quote, or call.
- Use basketball/football/baseball/hockey evidence before abstract narrative.
- Invite debate without pretending every clip is historic.
- Avoid corporate language, generic hype, and empty "must watch" phrasing.
- Avoid overclaiming if the clip is metadata-only or lacks transcript timing.

Caption patterns to support:

- "That changed the whole game."
- "This is the possession everyone is going to argue about."
- "If this trade happens, the whole conference shifts."
- "The box score does not explain how wild this was."
- "This call is going to be the conversation."

Hashtag strategy:

- Always include a lane tag such as `#RBSports` or `#RunnitBack`.
- Include one league tag when known.
- Include one team tag when central.
- Include one player tag when central.
- Include one angle tag when useful, such as `#NBATrade`, `#NFLPlayoffs`, `#BadCall`, or `#Clutch`.
- Keep hashtag packs readable and avoid stuffing every league/team mentioned in a long segment.

## Daily Plan Acceptance Criteria

RB Sports Daily Plan output should include exactly the operator fields proven by RB Women:

- Source/title.
- Player/team/entity.
- RB Sports angle.
- Score.
- Scout label.
- Why this should post now.
- Caption draft.
- Hashtag pack.
- Operator summary.
- Package/render status.
- Transcript/source status.
- Review reason for Develop/Hold.

Post Now acceptance:

- Recognizable player, team, coach, league, game, or transaction.
- Clear footage, quote, call, or reaction.
- Defensible RB Sports angle.
- Useful 10-45 second segment.
- Score and scout label agree with the operator summary.
- Caption centers the same entity as the source title.
- Hashtag pack matches the league/team/player/angle.
- Package/render status is honest.
- Transcript status is honest.

Develop acceptance:

- Same fields as Post Now.
- Clear reason it is not ready yet, such as missing package, no verified range, missing transcript timing, weak title, stale-but-reviewable debate, or unclear footage.

Hold acceptance:

- Source/title.
- Entity if available.
- Reason held.
- Noise category when applicable.

## Package, Render, And Retry-Ready Criteria

RB Sports should reuse the shared package/render mechanics:

- Prefer transcript-backed Clip Prep.
- Allow manual ranges only when the source/title makes the 10-45 second segment defensible.
- Require local 1080x1920 render.
- Validate with ffprobe before attach.
- Attach only after validation.
- Do not claim burned subtitles unless timed transcript segments exist.
- Keep metadata-only transcript state explicit.
- Do not weaken RB Women or other lane readiness rules.

Recommended RB Sports metadata-only rule:

- Metadata-only retry-ready can be considered only after RB Sports has its own smoke coverage.
- It should require an explicit manual range, valid local render, attached package, and current active Phase 1 source.
- It should not be enabled by copying the RB Women exception without RB Sports-specific tests.

Current active retry-ready output should include only active RB Sports Phase 1 sources. Historical disabled packages should remain audit data and should be counted separately.

## Smoke Coverage To Add Later

Do not implement these yet. These are the required RB Sports fixture categories for the implementation phase:

- Breaking trade reaction becomes `post_now`.
- Clutch playoff highlight becomes `post_now`.
- Controversial officiating clip becomes `post_now` or `develop` depending on package status.
- Star injury update becomes `develop` when footage or quote is unclear.
- Betting promo becomes `hold`.
- Long podcast without timestamps becomes `hold`.
- Generic schedule announcement becomes `hold`.
- Player-performance clip keeps the player as the centered entity.
- Team-collapse clip keeps the team as the centered entity.
- Metadata-only package does not claim burned subtitles.
- Disabled historical source package does not appear in current retry-ready output.

## Implementation Sequence For A Future Turn

When implementation is explicitly authorized:

1. Create the RB Sports source bible/config.
2. Add or update source QA for `rb_sports`.
3. Sync missing active sources only through an explicit source-safe command.
4. Wire source metadata into candidates.
5. Add RB Sports intelligence fixtures and scoring adjustments.
6. Add Daily Plan acceptance fixtures.
7. Add retry-ready filtering for active RB Sports Phase 1 sources.
8. Run full validation.
9. Generate one real RB Sports Daily Plan.
10. Package one strong candidate only if safe and non-posting.

Do not implement another lane until RB Sports Phase 1 passes the same acceptance level as RB Women.

## Safety Boundary

This plan does not authorize:

- TikTok login.
- TikTok upload.
- TikTok dry-run staging.
- Final Post click.
- Live publish behavior.
- Posting automation.
- RB Sports code implementation.
- RB Women changes unless RB Women validation fails.
