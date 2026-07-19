# RB Women Pipeline Blueprint

RB Women is the pilot channel for finishing an RBHQ lane end to end before copying the pattern to RB Sports, RB Combat, RB Arena, RB Futbol, and RB CFB. The channel key is `rb_women`, the TikTok handle is `@runnitbackwomen`, and the target channel id is `a1000000-0000-0000-0000-000000000004`.

This blueprint covers the non-posting pipeline only:

1. Curated source setup.
2. Source filtering and candidate scoring.
3. Intelligence V1 and optional mock/off AI Moment Analyst.
4. Operator moment selection.
5. Clip Prep and Caption Prep.
6. Local vertical render.
7. Optional burned subtitles when timed transcript segments exist.
8. Package attach after ffprobe validation.
9. Read-only retry-ready package listing.

It does not include TikTok login, upload, dry-run staging, posting, final Post clicks, or live publish behavior.

## Source Setup

RB Women Phase 1 sources live in `lib/rb-women-source-config.ts`.

Active Phase 1 feeds:

| Channel key | Priority | Use |
| --- | --- | --- |
| `wnba_official` | core | WNBA debates, player stories, elite basketball, fouls, officiating, and matchup clips |
| `unrivaled_basketball` | core | Unrivaled player quotes, matchups, press reactions, and debate clips |
| `indiana_fever` | core | Fever player stories, Caitlin Clark/Aliyah Boston hooks, foul debates, and rookie-veteran angles |
| `dallas_wings` | core | Wings player stories, Paige Bueckers/Arike Ogunbowale hooks, and major highlights |
| `minnesota_lynx` | core | Lynx veteran player stories, Kayla McBride/Napheesa Collier moments, and matchup tension |
| `las_vegas_aces` | core | Aces player quotes, championship angles, A'ja Wilson hooks, and officiating debate |
| `new_york_liberty` | core | Liberty star-player stories, matchup clips, Sabrina Ionescu/Breanna Stewart hooks, and media narratives |
| `chicago_sky` | core | Sky player callouts, Angel Reese/Kamilla Cardoso hooks, foul debate, and personality clips |
| `los_angeles_sparks` | useful | Sparks player quotes, Cameron Brink/Kelsey Plum hooks, and major highlights |
| `phoenix_mercury` | useful | Mercury veteran-vs-rookie angles, Kahleah Copper/Diana Taurasi hooks, and press reactions |
| `seattle_storm` | useful | Storm player quotes, Nneka Ogwumike/Skylar Diggins hooks, and major highlights |
| `atlanta_dream` | useful | Dream player stories, Rhyne Howard/Allisha Gray hooks, and matchup clips |
| `just_womens_sports` | core | player personality, culture, college basketball, searchable women's sports stories |
| `wnba_on_nbc` | useful | WNBA media narratives, broadcast-adjacent clips with a player hook, and major highlights |
| `tnt_sports_us` | useful | WNBA debate, strong quotes, player callouts, and major highlights |
| `all_womens_sports_network` | useful | athlete-centered women's sports stories, media narratives, and personality/culture clips |

Supplemental women-sports expansion feeds remain available for operator review when the player angle is clear:

| Channel key | Priority | Use |
| --- | --- | --- |
| `the_womens_game` | useful | personality and women's sports expansion clips when the athlete angle is clear |
| `cbs_sports_w_golazo` | useful | NWSL/USWNT coverage when the clip has player tension or debate |
| `nwsl_official` | experimental | women's sports expansion clips with strong visual action, player personality, or fan culture |

Disabled or noisy Phase 1 feeds:

| Channel key | Reason |
| --- | --- |
| `espn_w` | feed unavailable/noisy for Phase 1 |
| `ncaa_womens_basketball` | stale feed in current QA window |

The source smoke must confirm active/noisy source metadata and that RB Women candidates carry `score_breakdown.rbWomenSource`.

## Filtering Rules

Advance RB Women clips when they are person-centered and immediately understandable. The strongest inputs are recognizable WNBA players, debatable quotes, player-versus-player matchups, fouls, defense, officiating, fairness debates, strong visual basketball plays, and personality/culture clips.

Hold or reject:

- Generic league announcements without a player hook.
- Ticket promos.
- Sponsor ads.
- Schedule announcements.
- Merch promos.
- Community appearances without a story.
- Long livestreams without timestamps.
- Routine practice footage.
- Broad women's sports news without a person-centered angle.
- Clips requiring long outside context.
- Informational framing with no tension, personality, humor, or stakes.
- Experimental-source clips without a strong visual, player, or culture angle.

`classifyRBWomenSourceCandidate` returns `advanced`, `held`, or `rejected` with source priority metadata. The RSS poller attaches that metadata only for RB Women.

## Scoring Rules

RB Women Intelligence V1 uses isolated channel logic. Do not reuse these weights globally.

Boost:

- Recognizable athlete.
- Clear conflict or debate.
- Strong quote.
- Veteran-versus-rookie or player-versus-player context.
- Fouls, defense, officiating, fairness, or media narratives.
- Strong visual moment.
- Understandable without outside context.

Penalize:

- Generic announcements.
- Long explanations.
- Weak first two seconds.
- Stories without a recognizable person or clear human angle.

Decision bands:

- `80-100`: high confidence.
- `65-79`: operator review.
- `50-64`: hold unless timely.
- `<50`: reject.

Generated package outputs should include three hook options (`reaction`, `debate`, `search_first`), concise caption, no more than five hashtags, why-now explanation, operator summary, and suggested pinned comment.

## Transcript Requirements

Transcript-backed Clip Prep is preferred. A candidate is transcript-backed when timed transcript segments exist and the selected clip range overlaps those segments.

When transcripts are available:

- `captionPrep.subtitle_source` should be `transcript`.
- `captionPrep.transcript_segment_range` should be populated.
- Optional `--burn-subtitles` can create an ASS subtitle file and burn subtitles into the local vertical render.
- ffprobe validation must still pass after subtitle burn.

When transcripts are unavailable:

- `captionPrep.subtitle_source` should be `metadata_only`.
- `captionPrep.transcript_segment_range` is `null`.
- `--burn-subtitles` must skip safely with `subtitle_source_metadata_only`.
- RB Women metadata-only packages can be rendered and listed as `ready_for_tiktok_retry` only after an operator-selected range, local render validation, and package attach.
- Other lanes still require normal transcript-backed `ready` Clip Prep for retry-ready listing.

## Render Steps

Use AI Moment Analyst off unless explicitly testing mock mode:

```bash
RBHQ_AI_MOMENT_ANALYST=off npm run moment:select -- --candidate-id <candidate-id> --start-seconds <start> --end-seconds <end> --selected-by rb-women-pipeline-qa
RBHQ_AI_MOMENT_ANALYST=off npm run clip-prep:refresh -- --candidate-id <candidate-id>
RBHQ_AI_MOMENT_ANALYST=off npm run clip-prep:batch-local-render -- --limit 3 --channel rb_women --burn-subtitles --download-source
RBHQ_AI_MOMENT_ANALYST=off npm run clip-prep:batch-local-render -- --limit 3 --channel rb_women --burn-subtitles --download-source --attach
RBHQ_AI_MOMENT_ANALYST=off npx tsx scripts/list-tiktok-retry-ready-packages.ts --limit 20
```

Rules:

- Do not auto-download. Use `--download-source` only when source acquisition is intentionally requested.
- Do not attach until the no-attach render validates.
- Keep the vertical render at 1080x1920 with blurred background and contained foreground.
- Keep caption-safe lower-third margins.
- Never call TikTok login, upload, dry-run staging, posting, or live publish from this flow.

## QA Checklist

Before considering RB Women ready:

- Active source set is present and noisy sources are disabled or identified.
- RB Women-only ingestion creates candidates and attaches source priority metadata.
- Intelligence V1 uses RB Women priorities without changing other lanes.
- AI Moment Analyst is `off` or `mock`; no live AI calls.
- Moment selection stores an operator-selected range.
- Clip Prep has either transcript-backed `ready` or metadata-only prep with a manual range.
- Caption Prep includes subtitle source, opener text, safe-zone notes, style, and transcript range when available.
- Local vertical MP4 validates with ffprobe as 1080x1920 H.264/AAC.
- Burned subtitles are used only for transcript-backed clips and skipped safely for metadata-only clips.
- Package attach happens only after validation.
- Retry-ready listing includes package id, candidate id, lane, source title, asset path, clip range, caption, dry-run status, and caption-prep metadata.
- Daily Content Plan entries expose clip topic, player/entity when Intelligence V1 can identify one, source, score, why-now, caption draft, hashtag pack, operator summary, review reason for MAYBE/HOLD items, and package/render status when queue readiness is present.
- No TikTok login, upload, post, final Post click, stage-upload, dry-run trigger, or live publish occurred.

## Current Phase 1 QA Notes

Observed source quality:

- Core/useful Phase 1: `wnba_official`, `unrivaled_basketball`, team feeds, `just_womens_sports`, `wnba_on_nbc`, `tnt_sports_us`, `all_womens_sports_network`.
- Supplemental with stricter review: `nwsl_official`, `cbs_sports_w_golazo`, `the_womens_game`.
- Noisy or disabled: `espn_w`, `ncaa_womens_basketball`.

Transcript coverage is the main limitation. WNBA YouTube sources often returned metadata-only Clip Prep in the QA window. NWSL sources produced at least one transcript-backed package with timed segments and successful burned-subtitle validation.

## Adapting This To Other Lanes

Do not copy RB Women weights blindly. For each lane, adapt:

- Curated source list and noisy-source exclusions.
- Content pillars and priority order.
- Recognizable entity list.
- Boost and penalty language.
- Hook types and voice rules.
- SEO hashtag rules.
- Source-specific filters.
- Transcript expectations.
- QA fixtures for high-confidence, review, hold, and reject cases.

Keep shared mechanics unchanged unless a lane proves the same requirement through tests: source metadata, Intelligence V1, AI Moment Analyst gate, manual moment selection, Clip Prep, Caption Prep, local render validation, package attach, and retry-ready read-only listing.
