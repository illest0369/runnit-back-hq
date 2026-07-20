# RB Combat Phase 1 Replication Plan

RB Combat is the next lane after RB Women and RB Sports. This plan maps the proven non-posting lane pattern to combat sports before any source config, scoring code, packages, renders, TikTok staging, uploads, posts, or live publish behavior are added.

RB Combat should use the shared RBHQ mechanics only after its own source bible, entity model, scoring language, Daily Plan voice, and validation fixtures are defined. Do not copy RB Women or RB Sports constants blindly.

## Blueprint To Reuse

Reuse the validated Phase 1 sequence:

1. Define the lane source bible.
2. Add source priority metadata.
3. Add lane-specific candidate filters.
4. Define fighter, promotion, and event extraction.
5. Tune Intelligence V1 scoring and penalties.
6. Define caption voice and hashtag strategy.
7. Define Daily Plan labels and bucket limits.
8. Verify Clip Prep, render, and retry-ready rules.
9. Separate current active sources from historical/non-active sources.
10. Add smoke coverage.
11. Run source QA and full validation.
12. Only then create real packages for strong candidates.

The RB Combat work should remain non-posting throughout Phase 1.

## Source Bible Needed

RB Combat needs a curated source bible before scoring can be trusted. The source set should be fight-news and fight-moment first, not broad entertainment, generic sports debate, or betting-first content.

Document each candidate source with:

- Source key.
- Display name.
- RSS URL or source URL.
- Target RBHQ channel id.
- Priority tier: core, useful, experimental, disabled, or noisy.
- Coverage type: MMA, boxing, mixed combat, promotion-owned, broadcast/highlight, media analysis, or discovery-only.
- Content use case.
- Known noise patterns.
- Phase 1 enabled state.

Recommended Phase 1 source categories:

- Official promotion highlights and news.
- Official fighter or team channels only where useful short video volume exists.
- Trusted broadcast or rights-holder highlight sources.
- Trusted combat media news and analysis.
- Press conference, weigh-in, and faceoff sources.
- Discovery-only fighter reaction or fan-debate sources, disabled by default.

Potential source examples to evaluate in the source bible:

- UFC.
- ESPN MMA.
- Top Rank Boxing.
- PFL.
- ONE Championship.
- DAZN Boxing.
- Matchroom Boxing.
- Golden Boy Boxing.
- MMA Fighting.
- The MMA Hour or MMAFightingonSBN, only if clips or timestamped segments are reliable.
- Morning Kombat, disabled unless timestamped clips are useful.
- Full Send MMA or similar discovery sources, disabled by default until noise is measured.

Do not enable a source just because it is popular. It should produce current, attributable, short-form usable moments.

## Source Priority Metadata

RB Combat candidates should carry source metadata during ingestion so Daily Plan output can distinguish current Phase 1 sources from historical or noisy rows.

Required metadata:

- Source priority score.
- Source priority reason.
- Source category.
- Combat discipline: MMA, boxing, mixed, or unknown.
- Promotion or publisher.
- Active Phase 1 flag.
- Noisy-source reason when applicable.

Priority guidance:

- Core: official promotion clips, rights-holder highlights, trusted fight-news clips, reliable press conference/weigh-in feeds.
- Useful: trusted analysis channels with short timestamped segments.
- Experimental: fighter channels, reaction clips, and fan debate sources.
- Disabled/noisy: betting picks, generic rankings, long podcasts, low-context highlight compilations, and stale fight repost feeds.

## Likely Noisy Source Categories

RB Combat should deprioritize or disable:

- Long podcasts without timestamps.
- Betting-pick content.
- Generic rankings.
- Generic training footage.
- Old fight reposts without new context.
- Low-context highlight compilations.
- Fantasy matchmaking with no news hook.
- Sponsor, merch, ticket, and pay-per-view promo filler.
- Workout montages with no opponent, date, injury, quote, or fight angle.
- Evergreen technique breakdowns without a current fighter or event tie.

Historical candidates from these sources should be retained for auditability, but current Daily Plan and retry-ready output should prefer active Phase 1 sources.

## Scout Labels

RB Combat should keep the proven three-candidate cycle:

- `post_now`: strongest current fight moment or news item, ideally packaged or clearly packageable.
- `develop`: promising item that needs human review, source verification, segment selection, transcript timing, or angle confirmation.
- `hold`: stale, noisy, promotional, generic, or weak item with a clear review reason.

Default Daily Plan limit should be no more than three candidates per cycle unless explicitly overridden.

## RB Combat Content Angles

Prioritize combat-native moments:

- Knockout proof.
- Submission finish.
- Stare-down tension.
- Press conference tension.
- Weigh-in moment.
- Fighter callout.
- Bad judging or controversial decision.
- Injury or withdrawal news.
- Title fight stakes.
- Rivalry heat.
- Viral fighter quote.
- Momentum swing after a win or loss.
- Champion vs contender positioning.
- Short-notice replacement pressure.
- Referee stoppage debate.

Angle definitions:

- `finish proof`: knockout, submission, stoppage, or decisive fight-ending sequence.
- `judging controversy`: scorecard dispute, close decision, robbery claim, or referee/stoppage debate.
- `rivalry heat`: fight-week personal tension, faceoff reaction, staredown, callout, or bad blood.
- `title stakes`: belt, contender eliminator, interim title, champion defense, or ranking implications.
- `injury / withdrawal`: canceled fight, replacement fighter, medical issue, or comeback return.
- `fighter quote`: press conference, post-fight interview, viral line, or opponent callout.
- `momentum check`: winning streak, upset loss, comeback win, or career-turning result.

RB Combat should not over-index on generic "who is better" debate. The angle should be tied to fight evidence, current stakes, or a quote.

## Fighter, Promotion, And Event Extraction

RB Combat extraction needs a different entity model than RB Women and RB Sports.

Extract and preserve:

- Fighter names.
- Opponent names.
- Promotion: UFC, PFL, ONE, Bellator, Top Rank, Matchroom, Golden Boy, DAZN, ESPN MMA, or other publisher/promotion context.
- Event name: UFC 300, Fight Night, PFL Playoffs, ONE Friday Fights, title card, pay-per-view name, or boxing card.
- Division or weight class.
- Belt or title context.
- Result terms: KO, TKO, submission, decision, split decision, no contest, stoppage.
- News terms: injury, withdrawal, replacement, suspension, contract, rematch, short notice.

Do not treat generic event or location phrases as fighter names:

- Fight Night.
- UFC.
- MMA.
- Boxing.
- Weigh-In.
- Press Conference.
- Main Event.
- Co-Main Event.
- Las Vegas.
- Abu Dhabi.
- Madison Square Garden.
- T-Mobile Arena.

Entity precedence should be:

1. Title-centered fighter names.
2. Explicit opponent matchup names.
3. Promotion or event context.
4. Source metadata.
5. Caption or description text.

Stale generated copy should not override the fighter, opponent, promotion, or event centered in the actual title.

## Scoring Differences From RB Women And RB Sports

RB Combat should use a fast current-events window like RB Sports, but with fight-week and post-fight context.

Recommended defaults:

- 48-hour scouting window for normal candidates.
- 0-6 hour urgency boost for knockouts, submissions, controversial decisions, withdrawals, title news, and viral quotes.
- Event-week boost for weigh-ins, faceoffs, press conferences, and callouts tied to an upcoming fight.
- Post-fight boost for finishes, scorecard controversy, injury fallout, and callout clips.

Boost scoring for:

- Recognizable fighter or champion.
- Clear opponent or matchup.
- Current fight-week or post-fight context.
- Knockout, submission, stoppage, or decisive sequence.
- Strong quote or callout.
- Title, contender, or rivalry stakes.
- Judging or referee controversy.
- Injury, withdrawal, or short-notice replacement.
- Useful 10-45 second visual or quote segment.
- High-confidence active Phase 1 source.

Penalize scoring for:

- No clear fighter, opponent, promotion, or event.
- Long podcast without timestamps.
- Betting-pick or odds-first framing.
- Generic ranking or list content.
- Training footage without story.
- Old fight repost without a new hook.
- Low-context highlight compilation.
- Sponsor, merch, ticket, or pay-per-view promo filler.
- Stale candidate outside the scouting window.

RB Combat should be stricter than RB Women about recency and stricter than RB Sports about context. Combat clips often look exciting without being currently useful; Phase 1 should favor moments with a defensible fight-week, post-fight, or news reason.

## Caption And Hashtag Voice

RB Combat voice should be:

- Fan-first.
- Direct.
- Fight-literate.
- Tense when the moment earns it.
- Debate-friendly without fake-hot-take language.
- Evidence-led for finishes and controversy.
- Respectful of injuries and medical issues.
- Not corporate.

Caption guidance:

- Lead with the fighter, finish, quote, callout, controversy, or title stake.
- Keep the first line concrete.
- Avoid generic "this was crazy" captions unless the clip itself proves it.
- Do not make unsupported claims about judging, injury severity, or fighter intent.
- Do not sensationalize serious injuries.
- Avoid betting language in captions for Phase 1.

Hashtag strategy:

- Lane hashtag: `#RBCombat` or `#RunnitBack`.
- Discipline: `#MMA`, `#UFC`, `#Boxing`, `#PFL`, `#ONEChampionship`, or source-appropriate equivalent.
- Fighter hashtag when a recognizable fighter is centered.
- Event hashtag when the card/event is centered.
- Angle hashtag when useful: `#FightNight`, `#KO`, `#Submission`, `#TitleFight`, `#CombatSports`.
- Keep packs readable and avoid stuffing unrelated promotions.

## Daily Plan Acceptance Criteria

RB Combat Daily Plan output should include exactly the proven fields with combat equivalents:

- Source/title.
- Fighter/entity, opponent, promotion, or event context.
- RB Combat angle.
- Score.
- Scout label.
- Why this should post now.
- Caption draft.
- Hashtag pack.
- Operator summary.
- Package/render status.
- Transcript/source status.
- Review reason for Develop/Hold.

`post_now` requires:

- Recognizable fighter, promotion, matchup, or event.
- Clear footage or quote.
- Defensible RB Combat angle.
- Current fight-week, post-fight, news, or debate relevance.
- Useful 10-45 second segment or a candidate that is clearly packageable.
- Honest package/render and transcript status.

`develop` is appropriate when:

- The angle is promising but needs human confirmation.
- The source is credible but segment timing is missing.
- The title is strong but footage or transcript needs verification.
- The candidate is current but package/render status is incomplete.

`hold` is appropriate when:

- The title is generic, stale, promotional, betting-first, or ranking-first.
- There is no clear fighter, promotion, event, quote, or visual moment.
- It is a long podcast without timestamps.
- It is old fight footage without new context.
- It lacks a useful 10-45 second segment.

## Package, Render, And Retry-Ready Criteria

RB Combat should start from the default safe readiness rules:

- Prefer transcript-backed Clip Prep when timed transcript segments exist.
- Manual ranges are allowed only when the source and moment make a 10-45 second segment defensible.
- Do not create a package for a weak or noisy candidate.
- Render only after a real candidate passes source, angle, and segment review.
- Validate local render with ffprobe before attach.
- Required local render target: 1080x1920, h264, yuv420p, audio present, expected duration.
- Attach only after validation.
- Package/render status must be honest in Daily Plan output.
- Transcript status must be honest.
- Do not claim burned subtitles when transcript segments are unavailable.

RB Combat must not inherit the RB Women metadata-only retry-ready exception by default. If metadata-only retry-ready is ever allowed for RB Combat, it needs its own narrow rule, smoke coverage, and acceptance proof.

## Smoke Coverage To Add Later

When implementation begins, add smoke cases for:

- Knockout or submission highlight becomes Post Now.
- Bad judging or controversial decision becomes Post Now or Develop.
- Weigh-in or press conference tension advances with the correct fighter and opponent.
- Fighter callout produces a fighter quote or rivalry angle.
- Injury or withdrawal news gets urgency only when fresh.
- Generic betting-pick content holds or rejects.
- Generic ranking content holds.
- Long podcast without timestamps holds.
- Old fight repost without new context holds.
- Low-context highlight compilation holds.
- Fighter names remain player/fighter entities while UFC, Fight Night, Weigh-In, Press Conference, and locations remain event/source context.
- RB Women and RB Sports smoke behavior still passes.

## Not In This Step

This plan does not add:

- RB Combat source config.
- RB Combat source sync.
- RB Combat scoring code.
- RB Combat Daily Plan implementation.
- RB Combat packages.
- RB Combat renders.
- TikTok login, upload, dry-run staging, final Post click, posting, or live publish behavior.

The next RB Combat step should be docs/source work only: create the RB Combat source bible and source config, then add a source-safe QA command before any scoring or package work.
