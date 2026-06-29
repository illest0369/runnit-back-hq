export type NormalizedApifyClip = {
  external_id: string
  title: string
  hook: string
  video_url: string
  thumbnail_url: string
  source_name: string
  source_type: string
  source_url: string | null
  original_platform: string
  duration_seconds: number
  ai_score: number
  sport: string | null
  league: string | null
  aspect_ratio: string
  import_batch_id: string
}

export type ApifyNormalizationFailure = {
  index: number
  external_id?: string
  errors: string[]
}

export type ApifyNormalizationResult = {
  clips: NormalizedApifyClip[]
  failed: ApifyNormalizationFailure[]
}

export type NormalizedSourceItem = {
  source_platform: 'youtube' | 'tiktok' | 'instagram' | 'reddit'
  source_url: string
  source_external_id?: string | null
  title: string
  creator?: string | null
  duration_seconds?: number | null
  views?: number | null
  likes?: number | null
  comments?: number | null
  upload_date?: string | null
  raw_payload: Record<string, unknown>
}

const DIRECT_MEDIA_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.webm']

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function readString(item: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = stringOrNull(item[key])
    if (value) return value
  }

  return null
}

function readNumber(item: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = numberOrNull(item[key])
    if (value !== null) return value
  }

  return null
}

export function normalizeApifyItem(
  platform: NormalizedSourceItem['source_platform'],
  item: Record<string, unknown>,
): NormalizedSourceItem | null {
  const url = readString(item, ['url', 'webpageUrl', 'link', 'source_url', 'sourceUrl'])
  const title = readString(item, ['title', 'text', 'caption', 'description'])
  if (!url || !title) {
    return null
  }

  return {
    source_platform: platform,
    source_url: url,
    source_external_id: readString(item, ['id', 'videoId', 'postId', 'external_id', 'externalId']),
    title,
    creator: readString(item, ['author', 'channelName', 'username', 'creator']),
    duration_seconds: readNumber(item, ['duration', 'durationSeconds', 'duration_seconds']),
    views: readNumber(item, ['views', 'viewCount']),
    likes: readNumber(item, ['likes', 'likeCount']),
    comments: readNumber(item, ['comments', 'commentCount']),
    upload_date: readString(item, ['uploadDate', 'date', 'publishedAt']),
    raw_payload: item,
  }
}

function safeUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function normalizeUrl(value: string | null, options: { allowLocal: boolean }): string | null {
  if (!value) return null
  if (options.allowLocal && value.startsWith('/') && !value.startsWith('//')) return value

  const url = safeUrl(value)
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) return null

  return url.toString()
}

function hasMediaExtension(value: string) {
  const path = value.startsWith('/') ? value : safeUrl(value)?.pathname ?? ''
  return DIRECT_MEDIA_EXTENSIONS.some((extension) => path.toLowerCase().endsWith(extension))
}

function isSupportedMediaUrl(value: string | null): value is string {
  if (!value) return false
  if (value.startsWith('/') && !value.startsWith('//')) return hasMediaExtension(value)

  const url = safeUrl(value)
  if (!url) return false
  if (hasMediaExtension(value)) return true

  const format = url.searchParams.get('format') || url.searchParams.get('fm')
  return Boolean(format && DIRECT_MEDIA_EXTENSIONS.includes(`.${format.toLowerCase()}`))
}

function clampScore(value: number | null) {
  if (value === null) return 0
  return Math.min(100, Math.max(0, value))
}

function inferPlatform(item: Record<string, unknown>, sourceUrl: string | null) {
  const explicit = readString(item, ['original_platform', 'platform', 'sourcePlatform', 'type'])
  if (explicit) return explicit.toLowerCase()

  const hostname = sourceUrl ? safeUrl(sourceUrl)?.hostname.toLowerCase() ?? '' : ''
  if (hostname.includes('youtube') || hostname.includes('youtu.be')) return 'youtube'
  if (hostname.includes('tiktok')) return 'tiktok'
  if (hostname.includes('instagram')) return 'instagram'
  if (hostname.includes('reddit')) return 'reddit'

  return 'unknown'
}

function inferSport(value: string) {
  const text = value.toLowerCase()
  if (/\b(nba|wnba|basketball|hoops)\b/.test(text)) return 'basketball'
  if (/\b(nfl|cfb|football|quarterback|touchdown)\b/.test(text)) return 'football'
  if (/\b(mlb|baseball|homer|home run)\b/.test(text)) return 'baseball'
  if (/\b(ufc|mma|boxing|fight)\b/.test(text)) return 'combat'
  if (/\b(soccer|premier league|mls|goal)\b/.test(text)) return 'soccer'
  return null
}

function inferLeague(value: string) {
  const text = value.toUpperCase()
  for (const league of ['NBA', 'WNBA', 'NFL', 'CFB', 'MLB', 'UFC', 'MLS']) {
    if (text.includes(league)) return league
  }

  return null
}

function fallbackHook(title: string) {
  return title.length <= 74 ? title : `${title.slice(0, 71).trim()}...`
}

export function normalizeApifyDatasetItems(
  items: Array<Record<string, unknown>>,
  options: { importBatchId: string; defaultSourceName?: string; defaultSourceType?: string },
): ApifyNormalizationResult {
  const clips: NormalizedApifyClip[] = []
  const failed: ApifyNormalizationFailure[] = []

  items.forEach((item, index) => {
    const externalId = readString(item, [
      'external_id',
      'externalId',
      'id',
      'videoId',
      'postId',
      'shortCode',
    ])
    const title = readString(item, ['title', 'caption', 'text', 'description'])
    const hook = readString(item, ['hook', 'headline', 'title']) ?? (title ? fallbackHook(title) : null)
    const rawSourceUrl = readString(item, ['source_url', 'sourceUrl', 'url', 'webpageUrl', 'link'])
    const sourceUrl = normalizeUrl(rawSourceUrl, { allowLocal: false })
    const videoUrl = normalizeUrl(
      readString(item, [
        'video_url',
        'videoUrl',
        'video',
        'mediaUrl',
        'downloadUrl',
        'playableUrl',
        'cdnUrl',
      ]),
      { allowLocal: true },
    )
    const thumbnailUrl = normalizeUrl(
      readString(item, ['thumbnail_url', 'thumbnailUrl', 'thumbnail', 'image', 'imageUrl', 'displayUrl']),
      { allowLocal: true },
    )
    const sourceName =
      readString(item, ['source_name', 'sourceName', 'channelName', 'author', 'username', 'creator']) ??
      options.defaultSourceName ??
      'Apify Import'
    const sourceType =
      readString(item, ['source_type', 'sourceType']) ??
      options.defaultSourceType ??
      inferPlatform(item, sourceUrl)
    const durationSeconds = readNumber(item, ['duration_seconds', 'durationSeconds', 'duration'])
    const aiScore = clampScore(readNumber(item, ['ai_score', 'aiScore', 'score', 'viralityScore']))
    const errors: string[] = []

    if (!title) errors.push('missing title')
    if (!hook) errors.push('missing hook')
    if (!videoUrl || !isSupportedMediaUrl(videoUrl)) errors.push('unsupported or missing direct video_url')
    if (!thumbnailUrl) errors.push('missing thumbnail_url')
    if (!sourceName) errors.push('missing source_name')
    if (durationSeconds === null || durationSeconds <= 0) errors.push('missing positive duration_seconds')

    if (errors.length > 0) {
      failed.push({ index, external_id: externalId ?? undefined, errors })
      return
    }

    const searchableText = [title, hook, sourceName, sourceUrl].filter(Boolean).join(' ')

    clips.push({
      external_id: externalId ?? (videoUrl as string),
      title: title as string,
      hook: hook as string,
      video_url: videoUrl as string,
      thumbnail_url: thumbnailUrl as string,
      source_name: sourceName,
      source_type: sourceType,
      source_url: sourceUrl,
      original_platform: inferPlatform(item, sourceUrl),
      duration_seconds: durationSeconds as number,
      ai_score: aiScore,
      sport: readString(item, ['sport']) ?? inferSport(searchableText),
      league: readString(item, ['league']) ?? inferLeague(searchableText),
      aspect_ratio: readString(item, ['aspect_ratio', 'aspectRatio']) ?? '9:16',
      import_batch_id: options.importBatchId,
    })
  })

  return { clips, failed }
}
