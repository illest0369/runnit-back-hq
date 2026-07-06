# RBHQ MVP Checkpoint

**Date:** 2026-07-05
**HEAD:** `7ecc7c8`
**Status:** MVP-complete. Manual publish-only. No live TikTok posting.

---

## MVP Status

All acceptance criteria met as of `7ecc7c8`. The operator app is usable for the full manual moderation and Metricool handoff loop across three active lanes.

---

## Important Commits

| Commit | Description |
|--------|-------------|
| `74294dc` | RBHQ TikTok operations UI — OperatorApp shell, queue/publish/sources tabs |
| `a407654` | Fix local RBHQ UI boot — corrected local dev environment issues |
| `7ecc7c8` | Final MVP blocker fixes — futbol lane metadata, caption/hashtag persistence, add-source form |

---

## Confirmed MVP Capabilities

### Authentication
- Login via username + PIN (stored as bcrypt hash in Supabase)
- Session persists via signed HTTP-only cookie (`rb_session`)
- CSRF protection on all state-changing endpoints

### Lane access
| User | Lanes visible |
|------|--------------|
| `maly` / `malyhernandez` | RB Women, RB Combat, RB Futbol (3 lanes) |
| `rb_women` | RB Women (1 lane) |
| `rb_combat` | RB Combat (1 lane) |
| `rb_futbol` | RB Futbol (1 lane) |
| `rb_sports` | RB Sports (1 lane) |
| `rb_arena` | RB Arena (1 lane) |
| `rb_cfb` | RB CFB (1 lane) |

### Review queue
- Pending clips displayed per lane with AI score, hook, source, thumbnail
- Approve, reject, hold — all persist to Supabase immediately
- Source filter (all sources or per-source) works within a lane

### Publish queue
- Approved clips with a rendered MP4 appear in the publish tab
- Caption editable — saves via `PATCH /api/metricool-export/{clipId}`; survives page reload
- Hashtags editable — same persistence mechanism; stored as `editorial_hashtags:` entry in `moderation_notes`
- Copy caption, copy hashtags — client-side clipboard
- Export JSON — downloads the full `PublishExportPackage` for manual upload
- "Now" — hands off to Metricool immediately (test mode or live depending on `METRICOOL_TEST_MODE`)
- "Schedule" — schedules in Metricool at the chosen datetime

### Sources
- Sources tab shows active sources for the selected lane
- Add source form accepts a full YouTube channel URL or a bare YouTube channel ID (`UC…`); bare IDs are normalized to `https://www.youtube.com/channel/UC…` before posting
- Newly added sources appear in the Configured section immediately and persist on reload

### Channels registered in CHANNEL_META
| Channel ID | Slug | TikTok handle |
|------------|------|---------------|
| `a1000000-…-001` | sports | `@runnitbacksports` |
| `a1000000-…-002` | arena | `@runnitbackarena` |
| `a1000000-…-003` | combat | `@runnitbackcombat` |
| `a1000000-…-004` | women | `@runnitbackwomen` |
| `93484eef-…` | runnitbackcfb | `@runnitbackcfb` |
| `a1000000-…-005` | futbol | `@runnitbackfutbol1` |

---

## Known Limitations

- **No live TikTok posting.** `postToTikTok()` always throws `TIKTOK_DIRECT_POSTING_DISABLED_USE_MANUAL_HANDOFF`. All clips must be published manually through Metricool or by downloading the export JSON.
- **Metricool test mode default.** `METRICOOL_TEST_MODE=1` in `.env.example`. Live Metricool handoffs require `METRICOOL_TEST_MODE=0` and a valid `METRICOOL_API_KEY` + brand IDs.
- **Caption override storage.** Edited captions/hashtags are stored as prefixed JSON entries in the `moderation_notes` column — not in dedicated DB columns. This is intentional for the MVP (no schema migration required) but is non-obvious.
- **Admin fallback is maly's 3 lanes.** Any `admin`-role user with no explicit channel assignments receives the same 3-lane set as maly (`rb_women`, `rb_combat`, `rb_futbol`). A true all-channel admin view is post-MVP.
- **Chrome extension not used.** Browser smoke tests were validated via HTTP + Supabase direct queries. Browser-level E2E is post-MVP.
- **No clip render pipeline in MVP.** Clips with `needs_clip_render` status appear in the queue but the MP4 render worker is a separate process (`npm run worker:clips`) that must be running independently.
- **Node.js 22 required for dev.** The system default node may be 18.x (below Next.js 15 minimum). Use `node@22` from Homebrew: `/opt/homebrew/Cellar/node@22/22.22.0/bin/node`.
- **Legacy publish route disabled.** `POST /api/publishPost` returns `410 Gone`. All publishing goes through `/api/metricool-export/`.

---

## Running Locally

### Prerequisites
- Node.js 22+ (Homebrew: `brew install node@22`)
- A `.env.local` file with the required vars (copy from `.env.example`)
- Supabase project credentials (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, etc.)
- Redis (for background job queues; `REDIS_URL`)

### Start the dev server

```bash
cd /Users/malyhernandez/Dev/rbhq

# If the system node is too old, prefix with the Homebrew path:
PATH="/opt/homebrew/Cellar/node@22/22.22.0/bin:$PATH" npm run dev
```

The app starts on `http://localhost:3000`. If that port is occupied (another Next.js project), use:

```bash
PATH="/opt/homebrew/Cellar/node@22/22.22.0/bin:$PATH" npm run dev -- --port 3001
```

### Start the clip worker (optional, for render pipeline)

```bash
npm run build:worker && npm run worker:clips
```

---

## Logging In

> Credentials live in Supabase (`users` table, `pin_hash` column). Do not store PINs in env files or commit them.

Login methods accepted by `POST /api/login`:

| Field | Description |
|-------|-------------|
| `username` + PIN as `pin` | Operator PIN login (primary) |
| `email` + `password` | Email/password login (admin path) |

The login page is at `/login`. Successful auth sets a signed `rb_session` cookie valid for the session.

**Test accounts in Supabase:**

| Username | Role | Lanes |
|----------|------|-------|
| `maly` | operator (treated as 3-lane admin) | Women, Combat, Futbol |
| `rb_women` | operator | Women |
| `rb_combat` | operator | Combat |
| `rb_futbol` | operator | Futbol |

PINs must be retrieved from Supabase or from the person who provisioned the account. They are bcrypt-hashed; no plaintext is stored in the codebase.

---

## Manual Publishing Flow

1. Log in as `maly` or a lane operator.
2. Navigate to the **Queue** tab and review pending clips.
3. Approve or reject. Approved clips move to the **Publish** tab.
4. In the **Publish** tab, edit caption and hashtags if needed, then tap **Save caption & hashtags** to persist.
5. Choose one of:
   - **Now** — hands off to Metricool immediately.
   - **Schedule** — sets a scheduled time in Metricool.
   - **Export JSON** — downloads the full export package for manual upload.
   - **Copy caption / Copy hashtags** — clipboard copy for pasting into TikTok manually.
6. No live TikTok posting occurs at any step. The destination is always Metricool or a clipboard copy.

---

## Post-MVP Backlog

> The items below are **out of scope for the current MVP** and should not be added until the MVP is stable and actively used.

- [ ] Live TikTok posting via API (enable `postToTikTok` with actual API credentials)
- [ ] Dedicated `caption` and `hashtags` DB columns (replace `moderation_notes` override encoding)
- [ ] True all-channel admin role (separate from maly's 3-lane assignment)
- [ ] Browser-level E2E tests (Playwright, covering login → approve → publish flow)
- [ ] Automated clip ingestion scheduling (currently manual `npm run ingest:youtube-rss`)
- [ ] Gemini AI scoring improvements (current scores are present but not tuned)
- [ ] Metricool brand IDs for Futbol channel (currently not wired in `.env.example`)
- [ ] Multi-admin support with per-admin channel scoping
- [ ] Clip duplication detection UI (de-dupe logic exists in code; no UI for reviewing conflicts)
- [ ] Mobile-optimized operator onboarding flow (current UI targets phone but has no onboarding guide)
- [ ] n8n automation pipeline enablement (dry-run only at MVP; live publish disabled via `N8N_TEST_MODE=true`)
