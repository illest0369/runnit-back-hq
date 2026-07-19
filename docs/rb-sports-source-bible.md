# RB Sports Phase 1 Source Bible

RB Sports Phase 1 is source-led and non-posting. This bible defines the initial sports-news/highlight-first source foundation for `rb_sports`; it does not implement RB Sports scoring, create packages, render assets, upload, post, run TikTok dry-run staging, or trigger live publish behavior.

RB Sports channel metadata:

- Channel key: `rb_sports`.
- Channel id: `a1000000-0000-0000-0000-000000000001`.
- Handle: `@runnitbacksports`.
- Source config: `lib/rb-sports-source-config.ts`.
- Source QA command: `npm run source-system:rb-sports`.

## Phase 1 Source Strategy

RB Sports has much higher volume than RB Women, so Phase 1 should start narrower than "all sports." The first source set should favor clips that can produce a Daily Plan item with a clear entity, current reason to post, and useful 10-45 second segment.

Prioritize sources that surface:

- Clutch plays.
- Bad calls and officiating disputes.
- Rivalries.
- Injuries and returns.
- Trades, roster movement, and free agency.
- Playoff stakes.
- Coach and player pressers.
- Fan debate moments.
- Highlights with named player/team context.

Deprioritize or reject:

- Betting-only content.
- Fantasy-only content.
- Generic rankings.
- Schedule filler.
- Long podcasts without timestamps.
- Evergreen debate clips.
- Low-context highlight dumps.
- Sponsor, ticket, merch, or app-download promos.

## Active Phase 1 Sources

| Channel key | Display name | Category | Priority | Use case | Common noise |
| --- | --- | --- | --- | --- | --- |
| `nba_official` | NBA | official league highlights/news | core | Clutch plays, playoff stakes, bad calls, player reactions | Long highlight dumps, schedule announcements |
| `nfl_official` | NFL | official league highlights/news | core | Clutch plays, bad calls, rivalries, injury returns | Schedule release, long game recaps |
| `mlb_official` | MLB | official league highlights/news | core | Walk-offs, ejections, roster movement, playoff stakes | Condensed-game dumps, generic stat rankings |
| `nhl_official` | NHL | official league highlights/news | core | Overtime winners, fights, controversial calls, playoff moments | Generic top saves, long highlight dumps |
| `espn_main` | ESPN | trusted sports media analysis | useful | Breaking reaction, trades, injuries, fan debate | Broad studio segments, rankings, long podcasts |
| `bleacher_report` | Bleacher Report | trusted sports media analysis | useful | Fan-angle reactions, viral sports moments, debate | Sponsor activations, evergreen debate |
| `house_of_highlights` | House of Highlights | trusted broadcast/highlight source | useful | Clutch plays, fan reactions, highlight evidence | Low-context highlight dumps, creator events |
| `cbs_sports` | CBS Sports | trusted sports media analysis | useful | Pressers, playoff stakes, roster reaction | Betting odds, long panel segments |
| `nbc_sports` | NBC Sports | trusted broadcast/highlight source | useful | Broadcast highlights, interviews, pressers, playoff stakes | Long show segments, generic promos |
| `los_angeles_lakers` | Los Angeles Lakers | official team channel | useful | Star pressure, pressers, injury returns, roster movement | Practice footage, sponsor/ticket promos |
| `kansas_city_chiefs` | Kansas City Chiefs | official team channel | useful | Coach/player pressers, rivalry, injury returns, playoff stakes | Practice footage, long podcasts |
| `dallas_cowboys` | Dallas Cowboys | official team channel | useful | Team debate, pressers, rivalry and roster movement | Long podcasts, practice footage, community items |

Official team channels are intentionally limited. Add teams only when their feeds produce useful video volume and a reliable clip angle; do not onboard all teams by default.

## Disabled Or Deprioritized Categories

These are represented in config as disabled/noisy categories or hard source-filter patterns:

- `sports_fan_reactions_discovery`: discovery-only fan/reaction feeds, disabled by default until a specific source proves useful and current.
- `betting_fantasy_watchlist`: betting, odds, parlay, prop, fantasy, waiver, and start/sit content, disabled/noisy.
- `longform_podcast_watchlist`: full episodes, long podcasts, evergreen debates, and livestreams without timestamps, disabled/noisy.

These categories should not appear in current active Daily Plan or retry-ready output. Historical data should be retained for audit if such sources were ever tested.

## Source Filter Rules

Advance when:

- Source is active Phase 1.
- Title/description contains current sports-news or highlight signals.
- Candidate has a recognizable player, team, coach, league, game, transaction, injury, or call.
- Candidate likely contains a 10-45 second payoff.

Hold when:

- Source is active but the item is long-form, low-context, or too broad.
- A team feed item may be useful but needs operator confirmation.
- The clip needs timestamps or a clearer short-form segment.

Reject when:

- Source is not in the curated Phase 1 set and the score is weak.
- Source is disabled/noisy.
- Item is betting-only or fantasy-only.
- Item is schedule, ranking, ticket, merch, sponsor, or promo filler without a current clip angle.

## QA And Sync

Read-only QA:

```bash
npm run source-system:rb-sports
```

Explicit sync, only when the operator wants to apply config/seed rows to the DB:

```bash
npm run source-system:rb-sports -- --sync
```

The command reports:

- Configured active sources.
- Configured noisy/disabled sources.
- Seed coverage.
- Live DB coverage.
- Active category coverage.
- Missing seed rows.
- Missing DB rows.
- Disabled active DB rows.
- Enabled non-active DB rows.
- Invalid seed RSS URLs.

The sync path does not delete historical candidates or packages. It only upserts source rows from the seed and disables non-active RB Sports source rows for the RB Sports channel id.

## Not In Phase 1 Yet

Do not add these until the source set is stable:

- RB Sports scoring changes.
- RB Sports metadata-only retry-ready exception.
- Live AI calls.
- Package creation.
- Local render generation.
- TikTok login, upload, dry-run staging, final Post click, posting, or live publish behavior.
