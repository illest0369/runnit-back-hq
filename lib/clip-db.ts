import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { getChannelMeta, listChannelMeta, toAppChannel } from './channel-meta'
import {
  computePerformanceScore,
  confidenceLevelForScore,
  performanceLabelForScore,
  normalizePerformanceLabel,
  normalizeHashtags,
  normalizePostRecommendation,
  normalizePostStatus,
  type AppPost,
  type AppUserSettings,
  type ConfidenceLevel,
  type PostFeedback,
  type PostRecommendation,
} from './runnitback'

type PostRow = {
  id: string
  clip_id: string | null
  channel_id: string
  source_suggestion_id: string | null
  platform: string
  destination: string
  title: string | null
  video_url: string
  cdn_url: string | null
  local_url: string | null
  tiktok_url: string | null
  source_video_url: string | null
  hook: string
  hook_options: string | null
  caption: string
  hashtags: string | null
  score: number
  performance_score: number | null
  performance_label: string | null
  feedback_vote: string | null
  feedback_reason: string | null
  status: string
  comment_count_hint: number
  priority_score: number
  thumbnail_url: string | null
  review_status: string | null
  start_time: number | null
  end_time: number | null
  viral_reasoning: string | null
  risk_notes: string | null
  recommendation: string | null
  approved_by: string | null
  approved_at: string | null
  webhook_payload: string | null
  webhook_status: string | null
  webhook_delivered_at: string | null
  comment_bait: string | null
  reply_type: string | null
  created_at: string
  updated_at: string | null
}

type QueueJobRow = {
  id: string
  channel_id: string
  user_id: string | null
  source_url: string | null
  clip_url: string | null
  score: number
  status: string
  post_package: string | null
  created_at: string
  updated_at: string | null
}

type SourceRow = {
  id: string
  channel_id: string
  name: string | null
  handle: string | null
  url: string | null
  tier: string | null
  active: number
  ingest_limit: number | null
  cadence_per_day: number | null
  priority_weight: number | null
  created_at: string
}

type DefaultSource = {
  channelId: string
  name: string
  handle: string
  url: string
  tier: string
  ingestLimit: number
  cadencePerDay: number
  priorityWeight: number
}

type PersistIngestRowInput = {
  channelId: string
  sourceVideoUrl: string
  title: string
  thumbnailUrl: string | null
  sourceName: string
  sourceTier: string
  score: number
  publishedAt: string | null
  description: string | null
}

type IngestDescriptionMetadata = {
  text?: string | null
  priority?: string | null
  duration_seconds?: number | null
}

type SaveSourceSuggestionInput = {
  channelId: string
  operatorId: string
  sourceUrl: string
  title: string
  author: string | null
  durationSeconds: number | null
  thumbnailUrl: string | null
  initialScore: number
  reasoning: string[]
  metadata: Record<string, unknown>
}

type SaveGeneratedPostInput = {
  channelId: string
  requestedByUserId: string
  sourceSuggestionId?: string | null
  sourceVideoUrl: string
  title: string
  publicClipUrl: string
  cdnUrl: string | null
  localUrl: string | null
  score: number
  hook: string
  hookOptions: string[]
  caption: string
  hashtags: string[]
  riskNotes: string[]
  recommendation: PostRecommendation
  viralReasoning: string[]
  commentBait: { pinned: string; replyStarter: string } | null
  replyType: string | null
  startTime: number
  endTime: number
  transcriptExcerpt: string
}

type UpdatePostInput = Partial<{
  hook: string
  caption: string
  status: string
  comment_count_hint: number
  review_status: string
}>

type SavePostPerformanceInput = {
  postId: string
  views: number
  likes: number
  shares: number
  watchTime: number
  collectedAt?: string | null
}

type SavePostFeedbackInput = {
  postId: string
  vote: PostFeedback
  reason?: string | null
}

const DEFAULT_INGEST_SOURCES: DefaultSource[] = [
  { channelId: 'a1000000-0000-0000-0000-000000000001', name: 'House of Highlights', handle: '@Houseofhighlights', url: 'https://www.youtube.com/@Houseofhighlights/videos', tier: 'viral-native', ingestLimit: 10, cadencePerDay: 3, priorityWeight: 1.5 },
  { channelId: 'a1000000-0000-0000-0000-000000000001', name: 'Bleacher Report', handle: '@BleacherReport', url: 'https://www.youtube.com/@BleacherReport/videos', tier: 'viral-native', ingestLimit: 10, cadencePerDay: 3, priorityWeight: 1.5 },
  { channelId: 'a1000000-0000-0000-0000-000000000001', name: 'ESPN', handle: '@ESPN', url: 'https://www.youtube.com/@ESPN/videos', tier: 'standard', ingestLimit: 10, cadencePerDay: 3, priorityWeight: 1.1 },
  { channelId: 'a1000000-0000-0000-0000-000000000001', name: 'NBA', handle: '@NBA', url: 'https://www.youtube.com/@NBA/videos', tier: 'official-league', ingestLimit: 10, cadencePerDay: 3, priorityWeight: 1.2 },
  { channelId: 'a1000000-0000-0000-0000-000000000001', name: 'NFL', handle: '@NFL', url: 'https://www.youtube.com/@NFL/videos', tier: 'official-league', ingestLimit: 10, cadencePerDay: 3, priorityWeight: 1.2 },
  { channelId: 'a1000000-0000-0000-0000-000000000001', name: 'MLB', handle: '@MLB', url: 'https://www.youtube.com/@MLB/videos', tier: 'official-league', ingestLimit: 10, cadencePerDay: 3, priorityWeight: 1.2 },
  { channelId: 'a1000000-0000-0000-0000-000000000001', name: 'CBS Sports', handle: '@CBSSports', url: 'https://www.youtube.com/@CBSSports/videos', tier: 'standard', ingestLimit: 10, cadencePerDay: 3, priorityWeight: 1 },
  { channelId: 'a1000000-0000-0000-0000-000000000001', name: 'NBC Sports', handle: '@NBCSports', url: 'https://www.youtube.com/@NBCSports/videos', tier: 'standard', ingestLimit: 10, cadencePerDay: 3, priorityWeight: 1 },
  { channelId: 'a1000000-0000-0000-0000-000000000002', name: 'IGN', handle: '@IGN', url: 'https://www.youtube.com/@IGN/videos', tier: 'standard', ingestLimit: 8, cadencePerDay: 2, priorityWeight: 1 },
  { channelId: 'a1000000-0000-0000-0000-000000000002', name: 'GameSpot', handle: '@gamespot', url: 'https://www.youtube.com/@gamespot/videos', tier: 'standard', ingestLimit: 8, cadencePerDay: 2, priorityWeight: 1 },
  { channelId: 'a1000000-0000-0000-0000-000000000002', name: 'PlayStation', handle: '@PlayStation', url: 'https://www.youtube.com/@PlayStation/videos', tier: 'official', ingestLimit: 8, cadencePerDay: 2, priorityWeight: 1.1 },
  { channelId: 'a1000000-0000-0000-0000-000000000002', name: 'Xbox', handle: '@Xbox', url: 'https://www.youtube.com/@Xbox/videos', tier: 'official', ingestLimit: 8, cadencePerDay: 2, priorityWeight: 1.1 },
  { channelId: 'a1000000-0000-0000-0000-000000000002', name: 'Nintendo of America', handle: '@NintendoAmerica', url: 'https://www.youtube.com/@NintendoAmerica/videos', tier: 'official', ingestLimit: 8, cadencePerDay: 2, priorityWeight: 1.1 },
  { channelId: 'a1000000-0000-0000-0000-000000000002', name: 'Riot Games', handle: '@riotgames', url: 'https://www.youtube.com/@riotgames/videos', tier: 'official', ingestLimit: 8, cadencePerDay: 2, priorityWeight: 1.1 },
  { channelId: 'a1000000-0000-0000-0000-000000000002', name: 'VALORANT', handle: '@VALORANT', url: 'https://www.youtube.com/@VALORANT/videos', tier: 'official', ingestLimit: 8, cadencePerDay: 2, priorityWeight: 1.1 },
  { channelId: 'a1000000-0000-0000-0000-000000000002', name: 'Call of Duty League', handle: '@CODLeague', url: 'https://www.youtube.com/@CODLeague/videos', tier: 'official', ingestLimit: 8, cadencePerDay: 2, priorityWeight: 1.1 },
  { channelId: 'a1000000-0000-0000-0000-000000000002', name: 'ESL Counter-Strike', handle: '@ESLCS', url: 'https://www.youtube.com/@ESLCS/videos', tier: 'official', ingestLimit: 8, cadencePerDay: 2, priorityWeight: 1.1 },
  { channelId: 'a1000000-0000-0000-0000-000000000004', name: 'WNBA', handle: '@WNBA', url: 'https://www.youtube.com/@WNBA/videos', tier: 'official-league', ingestLimit: 10, cadencePerDay: 2, priorityWeight: 1.2 },
  { channelId: 'a1000000-0000-0000-0000-000000000004', name: 'NCAA Championships', handle: '@NCAAChampionships', url: 'https://www.youtube.com/@NCAAChampionships/videos', tier: 'official-league', ingestLimit: 10, cadencePerDay: 2, priorityWeight: 1.2 },
  { channelId: 'a1000000-0000-0000-0000-000000000004', name: 'espnW', handle: '@espnw', url: 'https://www.youtube.com/@espnw/videos', tier: 'standard', ingestLimit: 10, cadencePerDay: 2, priorityWeight: 1 },
  { channelId: 'a1000000-0000-0000-0000-000000000004', name: "Just Women's Sports", handle: '@justwomenssports', url: 'https://www.youtube.com/@justwomenssports/videos', tier: 'standard', ingestLimit: 10, cadencePerDay: 2, priorityWeight: 1 },
  { channelId: 'a1000000-0000-0000-0000-000000000004', name: 'NWSL', handle: '@NWSL', url: 'https://www.youtube.com/@NWSL/videos', tier: 'official-league', ingestLimit: 10, cadencePerDay: 2, priorityWeight: 1.2 },
  { channelId: 'a1000000-0000-0000-0000-000000000004', name: 'UFC', handle: '@ufc', url: 'https://www.youtube.com/@ufc/videos', tier: 'official-league', ingestLimit: 10, cadencePerDay: 2, priorityWeight: 1.2 },
  { channelId: 'a1000000-0000-0000-0000-000000000003', name: 'UFC', handle: '@ufc', url: 'https://www.youtube.com/@ufc/videos', tier: 'official-league', ingestLimit: 10, cadencePerDay: 3, priorityWeight: 1.2 },
  { channelId: 'a1000000-0000-0000-0000-000000000003', name: 'MMA Fighting', handle: '@MMAFightingonSBN', url: 'https://www.youtube.com/@MMAFightingonSBN/videos', tier: 'standard', ingestLimit: 10, cadencePerDay: 3, priorityWeight: 1 },
  { channelId: 'a1000000-0000-0000-0000-000000000003', name: 'DAZN Boxing', handle: '@DAZNBoxing', url: 'https://www.youtube.com/@DAZNBoxing/videos', tier: 'standard', ingestLimit: 10, cadencePerDay: 3, priorityWeight: 1 },
  { channelId: 'a1000000-0000-0000-0000-000000000003', name: 'GLORY Kickboxing', handle: '@GLORY', url: 'https://www.youtube.com/@GLORY/videos', tier: 'standard', ingestLimit: 10, cadencePerDay: 3, priorityWeight: 1 },
  { channelId: 'a1000000-0000-0000-0000-000000000003', name: 'PFL MMA', handle: '@PFLMMA', url: 'https://www.youtube.com/@PFLMMA/videos', tier: 'standard', ingestLimit: 10, cadencePerDay: 3, priorityWeight: 1 },
  { channelId: '93484eef-06d8-46fd-bce2-ce252422c58e', name: 'ESPN College Football', handle: '@espncfb', url: 'https://www.youtube.com/@espncfb/videos', tier: 'standard', ingestLimit: 10, cadencePerDay: 2, priorityWeight: 1 },
  { channelId: '93484eef-06d8-46fd-bce2-ce252422c58e', name: 'FOX College Football', handle: '@CFBONFOX', url: 'https://www.youtube.com/@CFBONFOX/videos', tier: 'standard', ingestLimit: 10, cadencePerDay: 2, priorityWeight: 1 },
  { channelId: '93484eef-06d8-46fd-bce2-ce252422c58e', name: 'SEC Network', handle: '@SECNetwork', url: 'https://www.youtube.com/@SECNetwork/videos', tier: 'standard', ingestLimit: 10, cadencePerDay: 2, priorityWeight: 1 },
  { channelId: '93484eef-06d8-46fd-bce2-ce252422c58e', name: 'Big Ten Network', handle: '@BigTenNetwork', url: 'https://www.youtube.com/@BigTenNetwork/videos', tier: 'standard', ingestLimit: 10, cadencePerDay: 2, priorityWeight: 1 },
  { channelId: '93484eef-06d8-46fd-bce2-ce252422c58e', name: 'On3', handle: '@On3sports', url: 'https://www.youtube.com/@On3sports/videos', tier: 'standard', ingestLimit: 10, cadencePerDay: 2, priorityWeight: 1 },
  { channelId: '93484eef-06d8-46fd-bce2-ce252422c58e', name: '247Sports', handle: '@247Sports', url: 'https://www.youtube.com/@247Sports/videos', tier: 'standard', ingestLimit: 10, cadencePerDay: 2, priorityWeight: 1 },
]

type LogPostDecisionInput = {
  postId: string
  action: 'approve' | 'reject'
  timeToDecision: number
  feedbackUsed: boolean
}

export type ApprovalWebhookPayload = {
  post_id: string
  channel_id: string
  operator_id: string | null
  cdn_url: string
  hook: string
  caption: string
  hashtags: string[]
  score: number
  source_url: string | null
  timestamp_range: {
    start_time: number | null
    end_time: number | null
  }
  approved_by: string
  approved_at: string
}

declare global {
  var __runnitbackClipDatabase: DatabaseSync | undefined
}

function getDatabasePath() {
  const configured = process.env.SQLITE_DB_PATH?.trim()
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured)
  }

  const writableTmpDir = process.env.VERCEL ? '/tmp' : process.env.TMP_DIR?.trim()
  if (writableTmpDir) {
    return path.resolve(writableTmpDir, 'runnit-back.sqlite')
  }

  return path.resolve(process.cwd(), 'tmp', 'runnit-back.sqlite')
}

function serializeJson(value: unknown): string | null {
  return value == null ? null : JSON.stringify(value)
}

function parseJson<T>(value: string | null): T | null {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function parseIngestDescription(value: string | null): IngestDescriptionMetadata {
  const parsed = parseJson<IngestDescriptionMetadata>(value)
  if (parsed && typeof parsed === 'object') {
    return parsed
  }

  return { text: value }
}

function initDatabase(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      label TEXT NOT NULL,
      name TEXT NOT NULL,
      niche TEXT NOT NULL,
      handle TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      name TEXT,
      handle TEXT,
      url TEXT,
      tier TEXT DEFAULT 'standard',
      active INTEGER NOT NULL DEFAULT 1,
      ingest_limit INTEGER NOT NULL DEFAULT 8,
      cadence_per_day INTEGER NOT NULL DEFAULT 2,
      priority_weight REAL NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS queue_jobs (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      user_id TEXT,
      source_url TEXT,
      clip_url TEXT,
      score REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      post_package TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS source_suggestions (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      operator_id TEXT NOT NULL,
      source_url TEXT NOT NULL,
      source_title TEXT NOT NULL,
      source_author TEXT,
      duration_seconds REAL,
      thumbnail_url TEXT,
      initial_score REAL NOT NULL DEFAULT 0,
      reasoning TEXT,
      metadata TEXT,
      status TEXT NOT NULL DEFAULT 'suggested',
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      clip_id TEXT,
      channel_id TEXT NOT NULL,
      source_suggestion_id TEXT,
      platform TEXT NOT NULL DEFAULT 'tiktok',
      destination TEXT NOT NULL DEFAULT 'webhook',
      title TEXT,
      video_url TEXT NOT NULL,
      cdn_url TEXT,
      local_url TEXT,
      tiktok_url TEXT,
      source_video_url TEXT,
      hook TEXT NOT NULL,
      hook_options TEXT,
      caption TEXT NOT NULL DEFAULT '',
      hashtags TEXT NOT NULL DEFAULT '[]',
      score REAL NOT NULL DEFAULT 0,
      performance_score REAL NOT NULL DEFAULT 0,
      performance_label TEXT NOT NULL DEFAULT 'flop',
      feedback_vote TEXT,
      feedback_reason TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      comment_count_hint INTEGER NOT NULL DEFAULT 0,
      priority_score REAL NOT NULL DEFAULT 0,
      thumbnail_url TEXT,
      review_status TEXT NOT NULL DEFAULT 'needs_review',
      start_time REAL,
      end_time REAL,
      viral_reasoning TEXT,
      risk_notes TEXT,
      recommendation TEXT,
      approved_by TEXT,
      approved_at TEXT,
      webhook_payload TEXT,
      webhook_status TEXT,
      webhook_delivered_at TEXT,
      comment_bait TEXT,
      reply_type TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS processed_videos (
      id TEXT PRIMARY KEY,
      source_id TEXT,
      channel_id TEXT,
      video_id TEXT,
      video_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'processed',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS processed_videos_video_url_idx
      ON processed_videos (video_url);

    CREATE INDEX IF NOT EXISTS source_suggestions_channel_idx
      ON source_suggestions (channel_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS post_performance (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      views INTEGER NOT NULL DEFAULT 0,
      likes INTEGER NOT NULL DEFAULT 0,
      shares INTEGER NOT NULL DEFAULT 0,
      watch_time REAL NOT NULL DEFAULT 0,
      performance_score REAL NOT NULL DEFAULT 0,
      performance_label TEXT NOT NULL DEFAULT 'flop',
      collected_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS post_performance_post_collected_idx
      ON post_performance (post_id, collected_at DESC);

    CREATE TABLE IF NOT EXISTS post_patterns (
      post_id TEXT PRIMARY KEY,
      hook TEXT NOT NULL DEFAULT '',
      clip_length REAL NOT NULL DEFAULT 0,
      timestamp TEXT NOT NULL,
      source TEXT,
      channel_id TEXT NOT NULL,
      performance_score REAL NOT NULL DEFAULT 0,
      performance_label TEXT NOT NULL DEFAULT 'flop',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pattern_weights (
      id TEXT PRIMARY KEY,
      pattern_type TEXT NOT NULL,
      pattern_key TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 1,
      total_score REAL NOT NULL DEFAULT 0,
      sample_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      UNIQUE(pattern_type, pattern_key)
    );

    CREATE TABLE IF NOT EXISTS post_decision_events (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      action TEXT NOT NULL,
      time_to_decision REAL NOT NULL DEFAULT 0,
      confidence_level TEXT NOT NULL DEFAULT 'LOW',
      performance_label TEXT NOT NULL DEFAULT 'flop',
      confusing_post INTEGER NOT NULL DEFAULT 0,
      feedback_used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS post_decision_events_created_idx
      ON post_decision_events (created_at DESC);

    CREATE INDEX IF NOT EXISTS post_decision_events_post_idx
      ON post_decision_events (post_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS user_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      default_channel_id TEXT,
      notifications_enabled INTEGER NOT NULL DEFAULT 1,
      view_preference TEXT NOT NULL DEFAULT 'compact',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  ensureColumn(db, 'posts', 'cdn_url', 'TEXT')
  ensureColumn(db, 'posts', 'local_url', 'TEXT')
  ensureColumn(db, 'posts', 'source_suggestion_id', 'TEXT')
  ensureColumn(db, 'posts', 'title', 'TEXT')
  ensureColumn(db, 'posts', 'performance_score', 'REAL NOT NULL DEFAULT 0')
  ensureColumn(db, 'posts', 'performance_label', "TEXT NOT NULL DEFAULT 'flop'")
  ensureColumn(db, 'posts', 'feedback_vote', 'TEXT')
  ensureColumn(db, 'posts', 'feedback_reason', 'TEXT')
  ensureColumn(db, 'posts', 'viral_reasoning', 'TEXT')
  ensureColumn(db, 'posts', 'risk_notes', 'TEXT')
  ensureColumn(db, 'posts', 'recommendation', 'TEXT')
  ensureColumn(db, 'posts', 'approved_by', 'TEXT')
  ensureColumn(db, 'posts', 'approved_at', 'TEXT')
  ensureColumn(db, 'posts', 'webhook_payload', 'TEXT')
  ensureColumn(db, 'posts', 'webhook_status', 'TEXT')
  ensureColumn(db, 'posts', 'webhook_delivered_at', 'TEXT')
  ensureColumn(db, 'sources', 'ingest_limit', 'INTEGER NOT NULL DEFAULT 8')
  ensureColumn(db, 'sources', 'cadence_per_day', 'INTEGER NOT NULL DEFAULT 2')
  ensureColumn(db, 'sources', 'priority_weight', 'REAL NOT NULL DEFAULT 1')
  db.exec(`
    UPDATE posts
    SET
      cdn_url = CASE
        WHEN cdn_url IS NULL AND video_url LIKE 'http%' THEN video_url
        ELSE cdn_url
      END,
      local_url = CASE
        WHEN local_url IS NULL AND video_url LIKE '/generated-clips/%' THEN video_url
        ELSE local_url
      END
  `)

  const insertChannel = db.prepare(`
    INSERT INTO channels (id, slug, label, name, niche, handle, status)
    VALUES (?, ?, ?, ?, ?, ?, 'active')
    ON CONFLICT(id) DO UPDATE SET
      slug = excluded.slug,
      label = excluded.label,
      name = excluded.name,
      niche = excluded.niche,
      handle = excluded.handle
  `)

  for (const channel of listChannelMeta()) {
    insertChannel.run(
      channel.id,
      channel.slug,
      channel.label,
      channel.name,
      channel.niche,
      channel.handle,
    )
  }

  const insertSource = db.prepare(`
    INSERT INTO sources (
      id, channel_id, name, handle, url, tier, active, ingest_limit, cadence_per_day, priority_weight
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      channel_id = excluded.channel_id,
      name = excluded.name,
      handle = excluded.handle,
      url = excluded.url,
      tier = excluded.tier,
      ingest_limit = excluded.ingest_limit,
      cadence_per_day = excluded.cadence_per_day,
      priority_weight = excluded.priority_weight
  `)

  for (const source of DEFAULT_INGEST_SOURCES) {
    insertSource.run(
      `default:${source.channelId}:${source.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      source.channelId,
      source.name,
      source.handle,
      source.url,
      source.tier,
      source.ingestLimit,
      source.cadencePerDay,
      source.priorityWeight,
    )
  }
}

function ensureColumn(db: DatabaseSync, tableName: string, columnName: string, definition: string) {
  const columns = db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as Array<{ name: string }>

  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
  }
}

export function getClipDb() {
  if (!globalThis.__runnitbackClipDatabase) {
    const dbPath = getDatabasePath()
    mkdirSync(path.dirname(dbPath), { recursive: true })
    globalThis.__runnitbackClipDatabase = new DatabaseSync(dbPath)
    initDatabase(globalThis.__runnitbackClipDatabase)
  }

  return globalThis.__runnitbackClipDatabase
}

export function listSourcesForChannel(channelId: string): Array<{
  id: string
  name: string | null
  handle: string | null
  url: string | null
  tier: string | null
  ingestLimit: number
  cadencePerDay: number
  priorityWeight: number
}> {
  const rows = getClipDb()
    .prepare(
      `
        SELECT
          id, name, handle, url, tier, active, created_at, channel_id,
          ingest_limit, cadence_per_day, priority_weight
        FROM sources
        WHERE channel_id = ? AND active = 1
        ORDER BY priority_weight DESC, created_at DESC
      `,
    )
    .all(channelId) as SourceRow[]

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    handle: row.handle,
    url: row.url,
    tier: row.tier,
    ingestLimit: Number(row.ingest_limit || 8),
    cadencePerDay: Number(row.cadence_per_day || 2),
    priorityWeight: Number(row.priority_weight || 1),
  }))
}

export function getSourceApprovalStats(sourceId: string): {
  reviewed: number
  approved: number
  approvalRate: number
} {
  const source = getClipDb()
    .prepare(`SELECT name FROM sources WHERE id = ?`)
    .get(sourceId) as { name: string | null } | undefined

  const sourceName = source?.name?.trim().toLowerCase()
  if (!sourceName) {
    return { reviewed: 0, approved: 0, approvalRate: 0 }
  }

  return getSourceApprovalStatsForName(sourceName)
}

function getSourceApprovalStatsForName(sourceName: string): {
  reviewed: number
  approved: number
  approvalRate: number
} {
  const rows = getClipDb()
    .prepare(
      `
        SELECT p.review_status, q.post_package
        FROM posts p
        LEFT JOIN queue_jobs q ON q.id = p.clip_id
        WHERE p.review_status IN ('approved', 'rejected')
      `,
    )
    .all() as Array<{ review_status: string; post_package: string | null }>

  let reviewed = 0
  let approved = 0

  for (const row of rows) {
    const packageSource = parseJson<{ source_name?: string | null }>(row.post_package)?.source_name
      ?.trim()
      .toLowerCase()

    if (packageSource !== sourceName.trim().toLowerCase()) {
      continue
    }

    reviewed += 1
    if (row.review_status === 'approved') {
      approved += 1
    }
  }

  return {
    reviewed,
    approved,
    approvalRate: reviewed ? approved / reviewed : 0,
  }
}

export function listExistingSourceVideoUrls(channelId: string): Set<string> {
  const rows = getClipDb()
    .prepare(
      `
        SELECT source_video_url
        FROM posts
        WHERE channel_id = ? AND source_video_url IS NOT NULL
      `,
    )
    .all(channelId) as Array<{ source_video_url: string | null }>

  return new Set(
    rows
      .map((row) => row.source_video_url?.trim())
      .filter((value): value is string => Boolean(value)),
  )
}

export function saveSourceSuggestion(input: SaveSourceSuggestionInput): string {
  const suggestionId = randomUUID()
  const createdAt = new Date().toISOString()

  getClipDb()
    .prepare(
      `
        INSERT INTO source_suggestions (
          id, channel_id, operator_id, source_url, source_title, source_author,
          duration_seconds, thumbnail_url, initial_score, reasoning, metadata,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'suggested', ?, ?)
      `,
    )
    .run(
      suggestionId,
      input.channelId,
      input.operatorId,
      input.sourceUrl,
      input.title,
      input.author,
      input.durationSeconds,
      input.thumbnailUrl,
      input.initialScore,
      serializeJson(input.reasoning),
      serializeJson(input.metadata),
      createdAt,
      createdAt,
    )

  return suggestionId
}

export function getSourceSuggestion(suggestionId: string): {
  id: string
  source_title: string
  initial_score: number
} | null {
  const row = getClipDb()
    .prepare(
      `
        SELECT id, source_title, initial_score
        FROM source_suggestions
        WHERE id = ?
      `,
    )
    .get(suggestionId) as
    | {
        id: string
        source_title: string
        initial_score: number
      }
    | undefined

  return row ?? null
}

export function updateSourceSuggestionStatus(
  suggestionId: string | null | undefined,
  status: 'suggested' | 'processing' | 'ready' | 'failed',
) {
  if (!suggestionId) {
    return
  }

  getClipDb()
    .prepare(
      `
        UPDATE source_suggestions
        SET status = ?, updated_at = ?
        WHERE id = ?
      `,
    )
    .run(status, new Date().toISOString(), suggestionId)
}

export function persistIngestCandidate(input: PersistIngestRowInput): string {
  const db = getClipDb()
  const queueJobId = randomUUID()
  const postId = randomUUID()
  const createdAt = new Date().toISOString()
  const performanceScore = Math.min(100, Math.max(1, input.score))
  const performanceLabel = performanceLabelForScore(performanceScore)
  const ingestMetadata = parseIngestDescription(input.description)

  db.prepare(
    `
      INSERT INTO queue_jobs (
        id, channel_id, user_id, source_url, clip_url, score, status, post_package, created_at, updated_at
      ) VALUES (?, ?, NULL, ?, ?, ?, 'pending', ?, ?, ?)
    `,
  ).run(
    queueJobId,
    input.channelId,
    input.sourceVideoUrl,
    null,
    input.score,
    serializeJson({
      title: input.title,
      published_at: input.publishedAt,
      thumbnail_url: input.thumbnailUrl,
      source_name: input.sourceName,
      source_tier: input.sourceTier,
      description: ingestMetadata.text ?? null,
      priority: ingestMetadata.priority ?? null,
      duration_seconds: ingestMetadata.duration_seconds ?? null,
    }),
    createdAt,
    createdAt,
  )

  db.prepare(
    `
      INSERT INTO posts (
        id, clip_id, channel_id, platform, destination, title, video_url, cdn_url, local_url, tiktok_url, source_video_url,
        hook, hook_options, caption, hashtags, score, performance_score, performance_label,
        status, comment_count_hint, priority_score,
        thumbnail_url, review_status, start_time, end_time, comment_bait, reply_type, created_at, updated_at
      ) VALUES (?, ?, ?, 'tiktok', 'webhook', ?, ?, NULL, NULL, NULL, ?, ?, NULL, ?, '[]', ?, ?, ?, 'queued', 0, ?, ?, 'needs_review', NULL, NULL, NULL, NULL, ?, ?)
    `,
  ).run(
    postId,
    queueJobId,
    input.channelId,
    input.title,
    input.sourceVideoUrl,
    input.sourceVideoUrl,
    input.title,
    input.title,
    input.score,
    performanceScore,
    performanceLabel,
    input.score,
    input.thumbnailUrl,
    createdAt,
    createdAt,
  )

  return queueJobId
}

export function saveGeneratedClipRecord(input: SaveGeneratedPostInput): {
  queueJobId: string
  postId: string
} {
  const db = getClipDb()
  const queueJobId = randomUUID()
  const postId = randomUUID()
  const createdAt = new Date().toISOString()

  db.prepare(
    `
      INSERT INTO queue_jobs (
        id, channel_id, user_id, source_url, clip_url, score, status, post_package, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?)
    `,
  ).run(
    queueJobId,
    input.channelId,
    input.requestedByUserId,
    input.sourceVideoUrl,
    input.publicClipUrl,
    input.score,
    serializeJson({
      title: input.title,
      hook: input.hook,
      hook_options: input.hookOptions,
      caption: input.caption,
      hashtags: input.hashtags,
      risk_notes: input.riskNotes,
      recommendation: input.recommendation,
      viral_reasoning: input.viralReasoning,
      comment_bait: input.commentBait,
      transcript_excerpt: input.transcriptExcerpt,
      source_video_url: input.sourceVideoUrl,
      start_time: input.startTime,
      end_time: input.endTime,
      reply_type: input.replyType,
    }),
    createdAt,
    createdAt,
  )

  db.prepare(
    `
      INSERT INTO posts (
        id, clip_id, channel_id, source_suggestion_id, platform, destination, title,
        video_url, cdn_url, local_url, tiktok_url, source_video_url,
        hook, hook_options, caption, hashtags, score, status, comment_count_hint, priority_score,
        thumbnail_url, review_status, start_time, end_time, viral_reasoning, risk_notes,
        recommendation, comment_bait, reply_type, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'tiktok', 'webhook', ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, NULL, 'needs_review', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    postId,
    queueJobId,
    input.channelId,
    input.sourceSuggestionId ?? null,
    input.title,
    input.publicClipUrl,
    input.cdnUrl,
    input.localUrl,
    input.sourceVideoUrl,
    input.hook,
    serializeJson(input.hookOptions),
    input.caption,
    serializeJson(input.hashtags),
    input.score,
    input.score,
    input.startTime,
    input.endTime,
    serializeJson(input.viralReasoning),
    serializeJson(input.riskNotes),
    input.recommendation,
    serializeJson(input.commentBait),
    input.replyType,
    createdAt,
    createdAt,
  )

  return { queueJobId, postId }
}

export function updateProcessedVideoStatus(videoUrl: string, status: 'processed' | 'failed') {
  const now = new Date().toISOString()
  const existing = getClipDb()
    .prepare(`SELECT id FROM processed_videos WHERE video_url = ?`)
    .get(videoUrl) as { id: string } | undefined

  if (existing) {
    getClipDb()
      .prepare(
        `
          UPDATE processed_videos
          SET status = ?, updated_at = ?
          WHERE id = ?
        `,
      )
      .run(status, now, existing.id)
    return
  }

  getClipDb()
    .prepare(
      `
        INSERT INTO processed_videos (id, source_id, channel_id, video_id, video_url, status, created_at, updated_at)
        VALUES (?, NULL, NULL, NULL, ?, ?, ?, ?)
      `,
    )
    .run(randomUUID(), videoUrl, status, now, now)
}

function toAppPost(row: PostRow): AppPost | null {
  const channel = toAppChannel(row.channel_id)
  if (!channel) {
    return null
  }

  const preferredVideoUrl = row.cdn_url ?? row.local_url ?? row.video_url

  return {
    id: row.id,
    channel_id: row.channel_id,
    title: row.title,
    video_url: preferredVideoUrl,
    cdn_url: row.cdn_url,
    local_url: row.local_url,
    source_video_url: row.source_video_url,
    tiktok_url: row.tiktok_url,
    hook: row.hook,
    hook_options: parseJson<string[]>(row.hook_options) ?? [],
    caption: row.caption,
    hashtags: normalizeHashtags(parseJson<unknown>(row.hashtags) ?? row.hashtags),
    score: Number(row.score) || 0,
    performance_score: Number(row.performance_score) || 0,
    performance_label: normalizePerformanceLabel(row.performance_label),
    feedback_vote:
      row.feedback_vote === 'up' || row.feedback_vote === 'down' ? row.feedback_vote : null,
    feedback_reason: row.feedback_reason,
    status: normalizePostStatus(row.status),
    comment_count_hint: Number(row.comment_count_hint) || 0,
    priority_score: Number(row.priority_score) || 0,
    start_time: row.start_time,
    end_time: row.end_time,
    viral_reasoning: parseJson<string[]>(row.viral_reasoning) ?? [],
    risk_notes: parseJson<string[]>(row.risk_notes) ?? [],
    recommendation: normalizePostRecommendation(row.recommendation),
    source_suggestion_id: row.source_suggestion_id,
    approved_by: row.approved_by,
    approved_at: row.approved_at,
    webhook_status: row.webhook_status,
    comment_bait: parseJson<{ pinned: string; replyStarter: string }>(row.comment_bait),
    reply_type: row.reply_type as AppPost['reply_type'],
    thumbnail_url: row.thumbnail_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
    channel,
  }
}

const VISIBLE_QUEUE_LIMIT = 60
const DEBUG_VISIBLE_SCORE_THRESHOLD = 50

export function listQueuePosts(channelIds: string[]): AppPost[] {
  if (channelIds.length === 0) {
    return []
  }

  const placeholders = channelIds.map(() => '?').join(', ')
  const rows = getClipDb()
    .prepare(
      `
        SELECT *
        FROM posts
        WHERE channel_id IN (${placeholders}) AND status IN ('queued', 'AI_DECISION') AND score >= ${DEBUG_VISIBLE_SCORE_THRESHOLD}
        ORDER BY score DESC, priority_score DESC, created_at DESC
        LIMIT ${VISIBLE_QUEUE_LIMIT}
      `,
    )
    .all(...channelIds) as PostRow[]

  return rows
    .map((row) => toAppPost(row))
    .filter((post): post is AppPost => Boolean(post))
}

export function listReviewPosts(
  channelId: string,
  options: { mode?: 'high-throughput' | 'standard'; limit?: number } = {},
) {
  const threshold = DEBUG_VISIBLE_SCORE_THRESHOLD
  const limit = Math.min(VISIBLE_QUEUE_LIMIT, Math.max(1, options.limit ?? VISIBLE_QUEUE_LIMIT))
  const rows = getClipDb()
    .prepare(
      `
        SELECT *
        FROM posts
        WHERE channel_id = ? AND review_status = 'needs_review' AND score >= ?
        ORDER BY score DESC, created_at DESC
        LIMIT ?
      `,
    )
    .all(channelId, threshold, limit) as PostRow[]

  return rows.map((row) => ({
    ...row,
    video_url: row.cdn_url ?? row.local_url ?? row.video_url,
  }))
}

export function getPostChannelId(postId: string): string | null {
  const row = getClipDb()
    .prepare(`SELECT channel_id FROM posts WHERE id = ?`)
    .get(postId) as { channel_id: string } | undefined

  return row?.channel_id ?? null
}

export function updatePostReviewStatus(
  postId: string,
  reviewStatus: 'approved' | 'rejected',
  approvedByUserId?: string | null,
) {
  const nextStatus = reviewStatus === 'approved' ? 'APPROVED_BY_HUMAN' : 'REJECTED'
  getClipDb()
    .prepare(
      `
        UPDATE posts
        SET review_status = ?, status = ?, approved_by = ?, approved_at = ?, updated_at = ?
        WHERE id = ?
      `,
    )
    .run(
      reviewStatus,
      nextStatus,
      reviewStatus === 'approved' ? approvedByUserId ?? null : null,
      reviewStatus === 'approved' ? new Date().toISOString() : null,
      new Date().toISOString(),
      postId,
    )
}

export function buildApprovalWebhookPayload(input: {
  postId: string
  approvedBy: string
  approvedAt: string
}): ApprovalWebhookPayload {
  const row = getClipDb()
    .prepare(
      `
        SELECT
          p.id AS post_id,
          p.channel_id,
          q.user_id AS operator_id,
          p.cdn_url,
          p.video_url,
          p.hook,
          p.caption,
          p.hashtags,
          p.score,
          p.source_video_url,
          p.start_time,
          p.end_time
        FROM posts p
        LEFT JOIN queue_jobs q ON q.id = p.clip_id
        WHERE p.id = ?
      `,
    )
    .get(input.postId) as
    | {
        post_id: string
        channel_id: string
        operator_id: string | null
        cdn_url: string | null
        video_url: string
        hook: string
        caption: string
        hashtags: string | null
        score: number
        source_video_url: string | null
        start_time: number | null
        end_time: number | null
      }
    | undefined

  if (!row) {
    throw new Error('Post not found')
  }

  return {
    post_id: row.post_id,
    channel_id: row.channel_id,
    operator_id: row.operator_id,
    cdn_url: row.cdn_url ?? row.video_url,
    hook: row.hook,
    caption: row.caption,
    hashtags: normalizeHashtags(parseJson<unknown>(row.hashtags) ?? row.hashtags),
    score: Number(row.score) || 0,
    source_url: row.source_video_url,
    timestamp_range: {
      start_time: row.start_time,
      end_time: row.end_time,
    },
    approved_by: input.approvedBy,
    approved_at: input.approvedAt,
  }
}

export function persistApprovalWebhookPayload(input: {
  postId: string
  payload: ApprovalWebhookPayload
  webhookStatus: string
  deliveredAt?: string | null
}) {
  getClipDb()
    .prepare(
      `
        UPDATE posts
        SET
          webhook_payload = ?,
          webhook_status = ?,
          webhook_delivered_at = ?,
          approved_by = ?,
          approved_at = ?,
          updated_at = ?
        WHERE id = ?
      `,
    )
    .run(
      serializeJson(input.payload),
      input.webhookStatus,
      input.deliveredAt ?? null,
      input.payload.approved_by,
      input.payload.approved_at,
      new Date().toISOString(),
      input.postId,
    )
}

export function getAppPost(postId: string): AppPost | null {
  const row = getClipDb()
    .prepare(`SELECT * FROM posts WHERE id = ?`)
    .get(postId) as PostRow | undefined

  return row ? toAppPost(row) : null
}

export function updateAppPost(postId: string, patch: UpdatePostInput): AppPost | null {
  const current = getAppPost(postId)
  if (!current) {
    return null
  }

  const entries = Object.entries(patch).filter(([, value]) => value !== undefined)
  if (entries.length === 0) {
    return current
  }

  const columns = entries.map(([key]) => `${key} = ?`)
  const values = entries.map(([, value]) => value)
  columns.push('updated_at = ?')
  values.push(new Date().toISOString())
  values.push(postId)

  getClipDb()
    .prepare(`UPDATE posts SET ${columns.join(', ')} WHERE id = ?`)
    .run(...values)

  return getAppPost(postId)
}

function clampMetric(value: number) {
  return Math.max(0, Math.round(Number.isFinite(value) ? value : 0))
}

function clampWatchTime(value: number) {
  return Math.max(0, Number.isFinite(value) ? value : 0)
}

function updatePatternWeight(patternType: 'hook' | 'source', patternKey: string | null, score: number) {
  const key = patternKey?.trim()
  if (!key) {
    return
  }

  const now = new Date().toISOString()
  const weightDelta = score >= 65 ? 0.08 : score < 35 ? -0.08 : 0

  getClipDb()
    .prepare(
      `
        INSERT INTO pattern_weights (
          id, pattern_type, pattern_key, weight, total_score, sample_count, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(pattern_type, pattern_key) DO UPDATE SET
          weight = max(0.5, min(2.5, pattern_weights.weight + ?)),
          total_score = pattern_weights.total_score + excluded.total_score,
          sample_count = pattern_weights.sample_count + 1,
          updated_at = excluded.updated_at
      `,
    )
    .run(randomUUID(), patternType, key, 1 + weightDelta, score, now, weightDelta)
}

function upsertPostPattern(postId: string, score: number, label: string) {
  const row = getClipDb()
    .prepare(
      `
        SELECT id, hook, start_time, end_time, source_video_url, channel_id, created_at
        FROM posts
        WHERE id = ?
      `,
    )
    .get(postId) as
    | {
        id: string
        hook: string
        start_time: number | null
        end_time: number | null
        source_video_url: string | null
        channel_id: string
        created_at: string
      }
    | undefined

  if (!row) {
    throw new Error('Post not found.')
  }

  const clipLength =
    row.start_time != null && row.end_time != null
      ? Math.max(0, Number(row.end_time) - Number(row.start_time))
      : 0
  const now = new Date().toISOString()

  getClipDb()
    .prepare(
      `
        INSERT INTO post_patterns (
          post_id, hook, clip_length, timestamp, source, channel_id,
          performance_score, performance_label, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(post_id) DO UPDATE SET
          hook = excluded.hook,
          clip_length = excluded.clip_length,
          timestamp = excluded.timestamp,
          source = excluded.source,
          channel_id = excluded.channel_id,
          performance_score = excluded.performance_score,
          performance_label = excluded.performance_label,
          updated_at = excluded.updated_at
      `,
    )
    .run(
      postId,
      row.hook,
      clipLength,
      row.created_at,
      row.source_video_url,
      row.channel_id,
      score,
      label,
      now,
    )

  updatePatternWeight('hook', row.hook, score)
  updatePatternWeight('source', row.source_video_url, score)
}

export function savePostPerformance(input: SavePostPerformanceInput) {
  const views = clampMetric(input.views)
  const likes = clampMetric(input.likes)
  const shares = clampMetric(input.shares)
  const watchTime = clampWatchTime(input.watchTime)
  const performanceScore = computePerformanceScore({
    views,
    likes,
    shares,
    watch_time: watchTime,
  })
  const performanceLabel = performanceLabelForScore(performanceScore)
  const collectedAt = input.collectedAt || new Date().toISOString()

  const existing = getClipDb()
    .prepare(`SELECT id FROM posts WHERE id = ?`)
    .get(input.postId) as { id: string } | undefined

  if (!existing) {
    throw new Error('Post not found.')
  }

  getClipDb()
    .prepare(
      `
        INSERT INTO post_performance (
          id, post_id, views, likes, shares, watch_time,
          performance_score, performance_label, collected_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      randomUUID(),
      input.postId,
      views,
      likes,
      shares,
      watchTime,
      performanceScore,
      performanceLabel,
      collectedAt,
    )

  getClipDb()
    .prepare(
      `
        UPDATE posts
        SET performance_score = ?, performance_label = ?, updated_at = ?
        WHERE id = ?
      `,
    )
    .run(performanceScore, performanceLabel, new Date().toISOString(), input.postId)

  upsertPostPattern(input.postId, performanceScore, performanceLabel)

  return {
    post_id: input.postId,
    views,
    likes,
    shares,
    watch_time: watchTime,
    performance_score: performanceScore,
    performance_label: performanceLabel,
    collected_at: collectedAt,
  }
}

export function savePostFeedback(input: SavePostFeedbackInput): AppPost {
  const reason = input.reason?.trim() || null

  getClipDb()
    .prepare(
      `
        UPDATE posts
        SET feedback_vote = ?, feedback_reason = ?, updated_at = ?
        WHERE id = ?
      `,
    )
    .run(input.vote, reason, new Date().toISOString(), input.postId)

  const post = getAppPost(input.postId)
  if (!post) {
    throw new Error('Post not found.')
  }

  return post
}

export function logPostDecision(input: LogPostDecisionInput) {
  const post = getAppPost(input.postId)
  if (!post) {
    throw new Error('Post not found.')
  }

  const timeToDecision = Math.max(0, input.timeToDecision)
  const confidenceLevel = confidenceLevelForScore(post.performance_score)
  const confusingPost = timeToDecision > 5
  const createdAt = new Date().toISOString()

  getClipDb()
    .prepare(
      `
        INSERT INTO post_decision_events (
          id, post_id, action, time_to_decision, confidence_level,
          performance_label, confusing_post, feedback_used, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      randomUUID(),
      input.postId,
      input.action,
      timeToDecision,
      confidenceLevel,
      post.performance_label,
      confusingPost ? 1 : 0,
      input.feedbackUsed ? 1 : 0,
      createdAt,
    )

  return {
    post_id: input.postId,
    action: input.action,
    time_to_decision: timeToDecision,
    confidence_level: confidenceLevel,
    performance_label: post.performance_label,
    confusing_post: confusingPost,
    feedback_used: input.feedbackUsed,
    created_at: createdAt,
  }
}

export function getUserTestReport(limit = 10) {
  const rows = getClipDb()
    .prepare(
      `
        SELECT
          e.post_id,
          e.action,
          e.time_to_decision,
          e.confidence_level,
          e.performance_label,
          e.confusing_post,
          e.feedback_used,
          e.created_at,
          p.hook,
          p.source_video_url
        FROM post_decision_events e
        LEFT JOIN posts p ON p.id = e.post_id
        ORDER BY e.created_at DESC
        LIMIT ?
      `,
    )
    .all(limit) as Array<{
      post_id: string
      action: string
      time_to_decision: number
      confidence_level: ConfidenceLevel
      performance_label: string
      confusing_post: number
      feedback_used: number
      created_at: string
      hook: string | null
      source_video_url: string | null
    }>

  const total = rows.length
  const approvals = rows.filter((row) => row.action === 'approve').length
  const hesitations = rows.filter((row) => Boolean(row.confusing_post)).length
  const feedbackEvents = rows.filter((row) => Boolean(row.feedback_used)).length
  const totalTime = rows.reduce((sum, row) => sum + Number(row.time_to_decision || 0), 0)
  const confusingPosts = rows
    .filter((row) => Boolean(row.confusing_post))
    .sort((left, right) => Number(right.time_to_decision) - Number(left.time_to_decision))
    .slice(0, 5)
    .map((row) => ({
      post_id: row.post_id,
      hook: row.hook,
      time_to_decision: Number(row.time_to_decision || 0),
      confidence_level: row.confidence_level,
      performance_label: row.performance_label,
      source: row.source_video_url,
    }))

  const patternCounts = new Map<string, number>()
  rows
    .filter((row) => Boolean(row.confusing_post))
    .forEach((row) => {
      const key = `${row.confidence_level}/${row.performance_label}`
      patternCounts.set(key, (patternCounts.get(key) ?? 0) + 1)
    })

  return {
    sample_size: total,
    total_time_to_complete: Number(totalTime.toFixed(2)),
    avg_decision_time: total ? Number((totalTime / total).toFixed(2)) : 0,
    hesitation_rate: total ? Number((hesitations / total).toFixed(2)) : 0,
    approval_rate: total ? Number((approvals / total).toFixed(2)) : 0,
    feedback_usage_rate: total ? Number((feedbackEvents / total).toFixed(2)) : 0,
    most_confusing_posts: confusingPosts,
    patterns_causing_confusion: [...patternCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([pattern, count]) => ({ pattern, count })),
  }
}

export function getQueueDataForSession(userId: string, channelIds: string[]) {
  const channels = channelIds
    .map((channelId) => toAppChannel(channelId))
    .filter((channel): channel is NonNullable<typeof channel> => Boolean(channel))

  const settings = getOrCreateUserSettings(userId, channelIds[0] ?? null)
  const posts = listQueuePosts(channelIds)

  return { channels, posts, settings }
}

export function getOrCreateUserSettings(userId: string, defaultChannelId: string | null): AppUserSettings {
  const existing = getClipDb()
    .prepare(
      `
        SELECT id, user_id, default_channel_id, notifications_enabled, view_preference
        FROM user_settings
        WHERE user_id = ?
      `,
    )
    .get(userId) as
    | {
        id: string
        user_id: string
        default_channel_id: string | null
        notifications_enabled: number
        view_preference: 'compact' | 'comfortable'
      }
    | undefined

  if (existing) {
    return {
      id: existing.id,
      user_id: existing.user_id,
      default_channel_id: existing.default_channel_id,
      notifications_enabled: Boolean(existing.notifications_enabled),
      view_preference: existing.view_preference,
    }
  }

  const created: AppUserSettings = {
    id: randomUUID(),
    user_id: userId,
    default_channel_id: defaultChannelId,
    notifications_enabled: true,
    view_preference: 'compact',
  }

  getClipDb()
    .prepare(
      `
        INSERT INTO user_settings (id, user_id, default_channel_id, notifications_enabled, view_preference, updated_at)
        VALUES (?, ?, ?, 1, 'compact', ?)
      `,
    )
    .run(created.id, userId, defaultChannelId, new Date().toISOString())

  return created
}

export function getPrimaryChannelRecord(channelIds: string[]) {
  for (const channelId of channelIds) {
    const channel = getChannelMeta(channelId)
    if (channel) {
      return channel
    }
  }

  return null
}
