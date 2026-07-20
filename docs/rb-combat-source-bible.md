# RB Combat Phase 1 Source Bible

RB Combat Phase 1 starts with curated combat sources before scoring, Daily Plan logic, packages, renders, or posting behavior are added. The lane should be fight-news and fight-moment first: finishes, tension, callouts, title stakes, controversy, and source-backed fighter quotes.

This source bible covers non-posting source setup only. It does not authorize TikTok login, upload, dry-run staging, final Post clicks, posting, live publish behavior, packages, renders, or RB Combat scoring implementation.

## Channel

- Lane: RB Combat.
- Channel key: `rb_combat`.
- Target RBHQ channel id: `a1000000-0000-0000-0000-000000000003`.
- Phase 1 source config: `lib/rb-combat-source-config.ts`.
- Source QA command: `npm run source-system:rb-combat`.
- Source seed file: `sources/source_channels_seed.json`.

## Phase 1 Source Strategy

RB Combat should use sources that reliably surface:

- Knockouts.
- Submissions.
- Stare-downs.
- Weigh-ins.
- Press conference tension.
- Fighter callouts.
- Bad judging or controversial decisions.
- Injury or withdrawal news.
- Title fight stakes.
- Rivalry heat.
- Viral fighter quotes.

The source mix should avoid starting too broad. Combat content can look visually strong while being stale, contextless, betting-first, or archive-first. Phase 1 should favor current fight-week, post-fight, or news-relevant moments from accountable sources.

## Active Phase 1 Sources

| Source key | Display name | Category | Priority | Discipline | Use case |
| --- | --- | --- | --- | --- | --- |
| `ufc_official` | UFC | Official promotion channel | Core | MMA | Knockouts, submissions, faceoffs, weigh-ins, press conferences, title stakes. |
| `espn_mma` | ESPN MMA | Trusted broadcast/highlight | Core | MMA | Fighter interviews, injury/withdrawal news, callouts, post-fight and press reactions. |
| `one_championship` | ONE Championship | Official promotion channel | Core | Mixed | Finishes, striking clips, submissions, title stakes, rivalry moments. |
| `pfl_mma` | PFL MMA | Official league/event channel | Useful | MMA | Playoff stakes, contender stories, finishes, championship framing. |
| `dazn_boxing` | DAZN Boxing | Trusted broadcast/highlight | Core | Boxing | Boxing highlights, knockouts, faceoffs, weigh-ins, press-event tension. |
| `top_rank_boxing` | Top Rank Boxing | Official promotion channel | Useful | Boxing | Title fights, press conferences, boxing knockouts, fighter quotes. |
| `matchroom_boxing` | Matchroom Boxing | Official promotion channel | Useful | Boxing | Weigh-ins, faceoffs, rivalry heat, fighter callouts, press tension. |
| `mma_fighting` | MMA Fighting | Trusted combat media/interview | Useful | MMA | Interviews, callouts, controversial decisions, injury/withdrawal news, press clips. |

## Source Categories

### Official Promotion Channels

Use these as high-confidence sources for event-owned footage and moments:

- `ufc_official`.
- `one_championship`.
- `top_rank_boxing`.
- `matchroom_boxing`.

They can produce strong visuals and official clips, but they also contain sponsor, ticket, pay-per-view, merch, and generic event-promo filler. Source filters should advance specific fight moments and hold/reject generic promotion.

### Official League/Event Channels

Use these for event structures, playoff stakes, contender formats, and current event context:

- `pfl_mma`.

Disabled Phase 1 event/archive sources:

- `ufc_fight_pass`.
- `bellator_mma`.

These remain useful for future context and historical audit, but Phase 1 keeps them disabled because their current value can skew archive-heavy or stale without new context.

### Trusted Broadcast/Highlight Channels

Use these for credible highlights, interviews, and news-adjacent clips:

- `espn_mma`.
- `dazn_boxing`.

They should advance when clips include current fighter quotes, injury/withdrawal news, post-fight reactions, title stakes, or strong visual moments. They should hold or reject betting, long show segments, and broad preview filler.

### Trusted Combat Media/Interview Channels

Use these for fighter voice and quote-driven moments:

- `mma_fighting`.

This category is valuable when interviews are clipped, timestamped, or clearly centered on a current quote, callout, controversy, injury, or fight-week story. Long podcasts or context-heavy discussion should not advance without a clear short-form payoff.

### Discovery/Reaction Sources

Discovery and reaction sources are disabled by default:

- `combat_fighter_reactions_discovery`.

This bucket can be revisited after Phase 1 proves the active source set. It should stay disabled until the lane has filters for creator-first framing, low-context reactions, and source attribution.

### Noisy Watchlists

Noisy watchlists are disabled by default:

- `combat_betting_picks_watchlist`.
- `combat_longform_podcast_watchlist`.
- `combat_stale_reposts_watchlist`.

These are not Phase 1 ingestion targets. They document known noise patterns so source QA and smoke coverage can prove the lane keeps them out of current output.

## Source Metadata

Every RB Combat source should carry:

- Source priority score.
- Source priority reason.
- Source category.
- Discipline: MMA, boxing, mixed, kickboxing, or unknown.
- Promotion or publisher.
- Active Phase 1 flag.
- Noisy-source reason when applicable.

This metadata should be attached during RSS candidate creation so future Daily Plan, retry-ready, and source QA views can separate active current candidates from historical or disabled-source rows.

## Advance Filters

RB Combat source filters should advance:

- Knockout, KO, TKO, stoppage, or submission titles.
- Stare-down, faceoff, weigh-in, or press conference tension.
- Fighter callouts and viral quotes.
- Bad judging, controversial decision, robbery, split decision, or stoppage debate.
- Injury, withdrawal, replacement, or short-notice news.
- Title fight, championship, belt, contender, or playoff stakes.
- Rivalry heat, beef, trash talk, post-fight reaction, and current fight-week clips.

## Hold Or Reject Filters

RB Combat source filters should hold or reject:

- Betting-pick content.
- Long podcasts without timestamps.
- Generic rankings.
- Stale fight reposts without new context.
- Generic training footage.
- Low-context highlight compilations.
- Pay-per-view, ticket, merch, sponsor, or event-promo filler.
- Old full fights or free fights without a current fighter, event, or news hook.

## Phase 1 Disabled And Noisy Sources

Disabled but tracked:

- `bellator_mma`: historical/event context, disabled because current value can skew stale/archive-heavy.
- `ufc_fight_pass`: official event/archive context, disabled because Phase 1 should avoid stale repost-heavy feeds.

Disabled watchlists:

- `combat_fighter_reactions_discovery`: reaction/discovery bucket, disabled until attribution and noise are measured.
- `combat_betting_picks_watchlist`: betting-only noise.
- `combat_longform_podcast_watchlist`: long-form content without reliable timestamps.
- `combat_stale_reposts_watchlist`: archive reposts and low-context compilations.

Historical candidates from disabled sources should be retained for auditability. They should not pollute current RB Combat Daily Plan or retry-ready output when those systems are implemented.

## Source QA

Use:

```bash
npm run source-system:rb-combat
```

Default mode is read-only. It lists current RB Combat DB sources and compares them to `lib/rb-combat-source-config.ts` plus `sources/source_channels_seed.json`.

Use explicit sync only when the read-only report shows missing configured active sources or enabled non-active rows:

```bash
npm run source-system:rb-combat -- --sync
```

The command must not delete historical candidates, download video, render video, upload video, post video, trigger TikTok dry-run staging, or trigger live publish behavior.

## Acceptance For Source Foundation

RB Combat source foundation is ready when:

- Active source config covers official promotion channels.
- Active source config covers official league/event channels.
- Active source config covers trusted broadcast/highlight channels.
- Active source config covers trusted combat media/interview channels.
- Discovery/reaction sources are disabled by default.
- Noisy watchlists are disabled by default.
- Active config rows have seed rows with valid YouTube RSS URLs.
- Source QA can run read-only.
- Optional sync is explicit with `--sync`.
- Source ingestion smoke proves combat source metadata is attached to candidates.
- RB Women and RB Sports source QA still passes.
