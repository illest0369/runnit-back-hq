# RBHQ Current State

## CURRENT OBJECTIVE

Run one new real RB Women source video through discovery, qualification, asset acquisition, transcript, moment recommendation, operator selection, clip prep, package creation, local render, package attachment, and TikTok staging. Stop before final TikTok Post.

## PROVEN WORKING STATE

- Proven reference package: `7b1f5ad9-f3e1-41e4-8427-fa039b2beeae`
- Channel: `rb_women`
- Source: Just Women's Sports YouTube Short `https://www.youtube.com/shorts/lXwLsUlmpm8`
- Candidate: `564a4e65-0f6a-4fb8-a3d6-c2075cfa0bef`
- Ingested video: `81a6716c-2e6d-4629-9da3-d232d1433c0d`
- Transcript: `2a51081d-d431-462f-af2a-af592554408d`, `yt-dlp-subtitles`, 8 timed segments
- Package state: `package_status=dry_run_complete`, `handoff_status=dry_run_succeeded`, `tiktok_staging_status=ready_for_manual_post`
- Asset: attached local MP4 under `tmp/mac-mini-assets`
- Staging result: `logged_in=true`, `uploadStaged=true`, `captionFilled=true`, `postButtonVisible=true`, `postButtonEnabled=true`, `clicksFinalPost=false`
- Missing/manual relationship: candidate `start_seconds/end_seconds` were null; Clip Prep supplied the actual suggested cut `0s-19.96s`.

Latest verified RB Women vertical-slice package:

- Package: `cadbae5f-5efe-470b-a166-a13446cd546c`
- Candidate: `5fd1513a-bb85-4942-83b6-1104002bb980`
- Ingested video: `a6944343-4042-4925-8e32-f7d2cdfa6b53`
- Source: NWSL `https://www.youtube.com/watch?v=AvDDMS5ruxI`
- Transcript: `3fc58beb-e929-4099-bf67-9857f8565a8c`, `yt-dlp-subtitles`, 387 timed segments
- Primary AI recommendation: `123.479s-143.44s`, score `89`, `sports_payoff`, `contextBurden=low`
- Alternates: `550.72s-567.56s` score `85`; `713.76s-729.36s` score `83`
- Operator selection: accepted the primary recommendation; selected timestamps persisted as `123.479s-143.44s`
- Clip Prep: `status=ready`, `confidence=high`; recommendation and operator-selection metadata persisted through refresh
- Asset: attached rendered MP4 under `tmp/mac-mini-assets`
- TikTok dry-run staging: logged-in RB Women CDP browser reached upload page, accepted file input, then blocked because TikTok stayed on the upload dropzone until timeout
- Current package state: `package_status=dry_run_failed`, `handoff_status=dry_run_failed`, `tiktok_staging_status=blocked`, `tiktok_staging_error=TIKTOK_UPLOAD_PROCESSING_TIMEOUT`
- Safety: `clicksFinalPost=false`, no live publish state set

## VERIFIED PIPELINE

| Stage | Input | Output | Primary code path | Database state | Failure mode | Confidence | Required action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Source discovery | Enabled YouTube RSS source | `ingested_videos` row plus initial metadata candidate | `scripts/ingest-youtube-rss.ts`, `lib/rss-poll.ts` | `source_channels`, `ingested_videos`, `clip_candidates` | Duplicate feeds produce 0 new videos | High | Working |
| Candidate qualification | RSS title/description | Initial `clip_candidates` score and caption | `lib/rss-poll.ts`, `lib/intelligence-v1.ts` | `clip_candidates.status=candidate` | Metadata candidates have no timestamps | High | Working as conservative first pass |
| Source acquisition | Package `source_url` | Downloaded playable source MP4 | `scripts/render-clip-prep-local.ts`, `lib/local-render-prep.ts` | Source MP4 stored under `tmp/mac-mini-assets/source-assets` | Previously required manual local MP4 only | High | Fixed in this session |
| Asset attachment | Rendered clip MP4 | Package asset fields attached | `lib/local-render-prep.ts`, `lib/mac-mini-handoff.ts` | `mac_mini_clip_packages.asset_status=attached` | Path outside asset root or missing file is rejected | High | Working |
| Transcription | `ingested_videos.video_url` | Timed transcript row | `scripts/transcript-video.ts`, `lib/youtube-transcripts.ts` | `video_transcripts`, `ingested_videos.ingest_status=transcript_available` | Captions unavailable returns `UNAVAILABLE`; no fake timestamps | High | Working |
| Moment recommendation | Timed transcript | Primary recommendation plus up to 2 alternates | `scripts/scout-video.ts`, `lib/tiktok-clip-scout.ts` | New `clip_candidates` rows with `start_seconds/end_seconds`, recommendation metadata, and source target channel | Duplicate scout reruns reuse existing v2 recommendation rows | High | Working |
| Operator clip selection | Candidate ID | Accepted/overridden selected timestamps | `scripts/select-moment.ts`, `lib/operator-moment-selection.ts` | `clip_candidates.start_seconds/end_seconds`, `score_breakdown.momentRecommendation`, `score_breakdown.operatorSelection` | Invalid or over-60s selections are rejected | High | Working |
| Rendering | Package source URL plus Clip Prep timestamps | Rendered 9:16 MP4 | `scripts/render-clip-prep-local.ts`, `lib/local-render-prep.ts` | Output MP4 attached to package when `--attach` is used | `yt-dlp`, `ffmpeg`, or source availability can fail | High | Fixed/working |
| Package creation | Candidate | Mac mini package | `scripts/package-candidate-for-mac-mini.ts`, `lib/mac-mini-handoff.ts` | `mac_mini_clip_packages.package_status=ready` | Requires approved/high-priority candidate and resolvable lane | High | Working |
| Mac mini handoff | Requested package | Worker fetches package and records dry-run | `scripts/mac-mini-run-dry-run.ts`, `lib/mac-mini-dry-run-worker.ts`, `app/api/mac-mini/packages/*` | `package_status`, `handoff_status`, `dry_run_result` | Missing asset records metadata-only/blocked result | High | Working |
| TikTok staging | Attached package, RB Women browser session | Uploaded draft/caption staged, no final Post click | `scripts/tiktok-web-upload-dry-run.ts` via dry-run worker | Prior package reached `ready_for_manual_post`; latest package is `blocked` | Login/challenge/account mismatch blocks; latest logged-in run timed out before TikTok editor appeared | Medium | Current blocker is TikTok upload page transition |
| Live publishing | Human final action only | Not performed by RBHQ automation | Guarded live command only | No published state set | Live command requires explicit flags/env and must not be run here | High | Do not run in this phase |
| Performance tracking | Published post metrics | Performance records | `app/api/performance/route.ts`, `lib/analytics/tiktok.ts` | Not exercised | Requires verified live post | Low | Out of scope for dry-run staging |

Duplicated or older paths:

- `lib/tiktok-renderer.ts` renders promoted review `clips` and can download from URLs, but the active Mac mini package flow uses `clip_candidates` and `mac_mini_clip_packages`.
- `services/videoService.ts` and `services/clipService.ts` are older clip-generation paths separate from the current Mac mini package staging flow.
- Files with ` 2` in their names appear duplicated and were not used in the verified path.

## CANONICAL TABLES AND STATUS FIELDS

- `source_channels`: RSS/source registry. Key fields: `channel_key`, `rss_url`, `target_rbhq_channel_id`, `enabled`.
- `ingested_videos`: discovered source videos. Key fields: `source_channel_id`, `external_video_id`, `video_url`, `thumbnail_url`, `ingest_status`.
- `video_transcripts`: timed transcript records. Key fields: `ingested_video_id`, `transcript_source`, `transcript_json`.
- `clip_candidates`: scout/operator candidates. Key fields: `target_channel_id`, `start_seconds`, `end_seconds`, `status`, `score`, `score_breakdown`, `clip_prep_status`, `clip_prep`.
- `mac_mini_clip_packages`: package/handoff/staging state. Key fields: `package_status`, `handoff_status`, `asset_status`, `local_asset_path`, `dry_run_result`, `tiktok_staging_status`.

## WORKING COMMANDS

```bash
npm run ingest:youtube-rss -- --channel <source_key> --url <rss_url> --display-name <name> --target-channel-id a1000000-0000-0000-0000-000000000004
npm run transcript:video -- --video-id <ingested_video_id>
npm run scout:video -- --video-id <ingested_video_id>
npm run moment:select -- --candidate-id <clip_candidate_id>
npm run clip-prep:refresh -- --candidate-id <clip_candidate_id>
npm run handoff:mac-mini:package -- --candidate-id <clip_candidate_id>
npm run clip-prep:render-local -- --package-id <package_id> --attach
npm run handoff:mac-mini:run-dry-run -- --base-url http://localhost:3000 --limit 1 --stage-upload --browser cdp --launch-cdp-chrome --timeout-ms 120000
```

Do not run the guarded live command during dry-run validation.

## SAFETY INVARIANTS

- RBHQ automation must not click the final TikTok Post button.
- RBHQ must not mark a package or clip published unless the post is verified live on TikTok.
- TikTok credentials stay in local browser profiles, not in RBHQ code/env/logs.
- Lane-to-browser-channel routing must remain enforced.
- `publishAction` remains `dry_run` for Mac mini staging.
- Live posting remains gated by explicit final-post flags and `RBHQ_TIKTOK_LIVE_POSTING_ALLOWED=true`.

## ACTIVE BLOCKERS

- Current blocker for the latest RB Women package: TikTok accepts the local MP4 file input in the logged-in RB Women CDP browser but never leaves the upload dropzone; RBHQ now records this as `TIKTOK_UPLOAD_PROCESSING_TIMEOUT` instead of a false ready result.
- A normal Chrome retry through the worker used the non-manual RB Women profile and correctly blocked as `TIKTOK_LOGIN_REQUIRED`; the intended logged-in path remains the CDP manual profile.
- The rendered MP4 for package `cadbae5f-5efe-470b-a166-a13446cd546c` is H.264/AAC, 1920x1080, 19.986s, 10.6 MB.

## DECISIONS MADE

- The first broken stage in a fresh vertical slice was source asset acquisition for Mac mini packages.
- Fixed the existing local render path rather than adding a parallel package renderer.
- `clip-prep:render-local --package-id <id> --attach` now uses the package source URL when no local source MP4 is supplied.
- The downloaded full source is stored under `tmp/mac-mini-assets/source-assets`; only the rendered clip is attached to the package.
- Timestamped transcription uses the existing RBHQ `yt-dlp` subtitle path (`scripts/transcript-video.ts`, `lib/youtube-transcripts.ts`) because it already returns timed caption segments for the tested RB Women source. Local `whisper` and `whisper-cli` are installed but were not needed for this source.
- Transcript-first moment recommendation is implemented in the existing scout path; it returns one primary plus at most two alternates and reuses existing v2 recommendation rows on rerun.
- Operator timestamp selection is persisted on the candidate and preserved through Clip Prep refresh.
- TikTok upload staging now waits for TikTok's editor/caption/post controls before treating an upload as staged.

## FILES CHANGED

- `lib/local-render-prep.ts`
- `lib/tiktok-clip-scout.ts`
- `lib/operator-moment-selection.ts`
- `scripts/render-clip-prep-local.ts`
- `scripts/scout-video.ts`
- `scripts/select-moment.ts`
- `scripts/smoke-moment-selection.ts`
- `scripts/tiktok-web-upload-dry-run.ts`
- `package.json`
- `docs/RBHQ_CURRENT_STATE.md`

## TESTS COMPLETED

- Fresh RB Women discovery: NWSL RSS inserted video `78c8aa51-53e5-4d44-b783-f1a27b18c86e`.
- Transcript acquisition: `d81148a5-37f6-4194-96ae-85a4a9191c2c`, 225 segments.
- Moment scout: candidate `fae0f869-874a-44fd-a400-2914a1e2847f`, 361.12s-377.52s.
- Clip Prep refresh: `status=ready`, `confidence=high`.
- Package creation: `d864a4db-9329-41d6-ad3d-35c9f1aa63b7`, `browserChannelKey=rb_women`.
- Local source acquisition/render/attach: downloaded source, rendered 16.4s MP4, `asset_status=attached`.
- TikTok dry-run staging: `result=PASS`, `logged_in=true`, `uploadStaged=true`, `captionFilled=true`, `clicksFinalPost=false`.
- `npm run smoke:local-render-prep`: PASS.
- `npm run smoke:mac-mini-assets`: PASS.
- `npm run smoke:operator-staging-ux`: PASS.
- `npm run lint`: PASS.

Latest RB Women vertical-slice test:

- Tooling found: `brew`, `yt-dlp`, `ffmpeg`, `ffprobe`, `whisper`, `whisper-cli`, and `jq`.
- Transcript acquisition: video `a6944343-4042-4925-8e32-f7d2cdfa6b53`, transcript `3fc58beb-e929-4099-bf67-9857f8565a8c`, `yt-dlp-subtitles`, 387 timed segments.
- Moment scout: primary `5fd1513a-bb85-4942-83b6-1104002bb980`, `123.479s-143.44s`, score `89`; alternates `6ad0fa3e-a599-4b08-8646-77e96c482b5c` and `26fb211c-8683-4a3a-9215-2ba64888d87a`.
- Scout idempotency check: rerun returned `reused=true` and no duplicate v2 recommendations were inserted.
- Operator selection: accepted the primary recommendation and persisted selected timestamps.
- Clip Prep refresh after selection: `status=ready`, `confidence=high`; recommendation and operator-selection metadata remained present after refresh.
- Package creation: `cadbae5f-5efe-470b-a166-a13446cd546c`, `browserChannelKey=rb_women`.
- Local source acquisition/render/attach: downloaded source, rendered 19.961s MP4, `asset_status=attached`.
- TikTok dry-run staging: `result=FAIL`, `tiktok_staging_status=blocked`, `tiktok_staging_error=TIKTOK_UPLOAD_PROCESSING_TIMEOUT`, `logged_in=true`, `uploadInputAccepted=true`, `uploadStaged=false`, `captionFilled=false`, `clicksFinalPost=false`.
- Duplicate verification: one package exists for selected candidate `5fd1513a-bb85-4942-83b6-1104002bb980`; no duplicate package was created.
- `npm run smoke:moment-selection`: PASS.
- `npm run smoke:transcript-scout`: PASS.
- `npm run smoke:mac-mini-assets`: PASS.
- `npm run smoke:operator-staging-ux`: PASS.
- `npm run smoke:tiktok-browser-profiles`: PASS.
- `npm run lint`: PASS.

## LAST VERIFIED RESULT

- Package: `cadbae5f-5efe-470b-a166-a13446cd546c`
- Source: NWSL `https://www.youtube.com/watch?v=AvDDMS5ruxI`
- Result: `package_status=dry_run_failed`, `handoff_status=dry_run_failed`, `tiktok_staging_status=blocked`, `tiktok_staging_error=TIKTOK_UPLOAD_PROCESSING_TIMEOUT`
- Asset: `/Users/malyhernandez/Dev/rbhq/tmp/mac-mini-assets/pkg-cadbae5f-5efe-470b-a166-a13446cd546c-candidate-5fd1513a-bb85-4942-83b6-1104002bb980-Leicy-Santos-Stunner-Ryanne-Brow.mp4`
- Safety: no Metricool call, no n8n call, no live publish state, no final Post click.

## NEXT STEP

Resolve the TikTok upload-page transition for logged-in CDP browser staging. The next investigation should focus on why TikTok stays on the dropzone after file input acceptance despite a valid H.264/AAC MP4.
