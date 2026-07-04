export type YouTubeRssEntry = {
  externalVideoId: string
  platform: 'youtube'
  title: string
  description: string | null
  videoUrl: string
  thumbnailUrl: string | null
  publishedAt: string | null
  rawEntry: Record<string, unknown>
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

function readTag(body: string, tag: string): string | null {
  const escaped = tag.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
  const match = body.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i'))
  const value = match?.[1]
  return value ? decodeXml(value) : null
}

function readAttribute(body: string, tag: string, attribute: string): string | null {
  const escapedTag = tag.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
  const escapedAttribute = attribute.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
  const match = body.match(new RegExp(`<${escapedTag}[^>]*\\s${escapedAttribute}=["']([^"']+)["'][^>]*>`, 'i'))
  const value = match?.[1]
  return value ? decodeXml(value) : null
}

function readVideoId(value: string | null): string | null {
  if (!value) return null
  const raw = value.trim()
  if (/^[a-zA-Z0-9_-]{6,}$/.test(raw) && !raw.includes('http')) return raw

  try {
    const url = new URL(raw)
    if (url.hostname.includes('youtu.be')) return url.pathname.split('/').filter(Boolean)[0] ?? null
    const watchId = url.searchParams.get('v')?.trim()
    if (watchId) return watchId
    return url.pathname.match(/\/shorts\/([^/?]+)/)?.[1]?.trim() ?? null
  } catch {
    return raw.match(/video:([a-zA-Z0-9_-]+)/)?.[1] ?? null
  }
}

function normalizePublishedAt(value: string | null): string | null {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function rawEntryFor(body: string, input: {
  externalVideoId: string
  title: string
  videoUrl: string
  publishedAt: string | null
  thumbnailUrl: string | null
  description: string | null
}) {
  return {
    ...input,
    xml: body,
  }
}

export function parseYouTubeRssXml(xml: string): YouTubeRssEntry[] {
  const seen = new Set<string>()
  const entries: YouTubeRssEntry[] = []

  for (const match of xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)) {
    const body = match[1] ?? ''
    const externalVideoId =
      readVideoId(readTag(body, 'yt:videoId')) ??
      readVideoId(readTag(body, 'id')) ??
      readVideoId(readAttribute(body, 'link', 'href'))
    if (!externalVideoId || seen.has(externalVideoId)) continue

    const title = readTag(body, 'title') || 'Untitled YouTube video'
    const videoUrl = readAttribute(body, 'link', 'href') || `https://www.youtube.com/watch?v=${externalVideoId}`
    const publishedAt = normalizePublishedAt(readTag(body, 'published') ?? readTag(body, 'updated'))
    const description = readTag(body, 'media:description') ?? readTag(body, 'summary')
    const thumbnailUrl = readAttribute(body, 'media:thumbnail', 'url')

    seen.add(externalVideoId)
    const entry = {
      externalVideoId,
      platform: 'youtube' as const,
      title,
      description,
      videoUrl,
      thumbnailUrl,
      publishedAt,
      rawEntry: rawEntryFor(body, {
        externalVideoId,
        title,
        videoUrl,
        publishedAt,
        thumbnailUrl,
        description,
      }),
    }
    entries.push(entry)
  }

  return entries
}

export async function fetchYouTubeRss(url: string): Promise<YouTubeRssEntry[]> {
  const response = await fetch(url, {
    headers: { 'user-agent': 'rbhq-youtube-rss/1.0' },
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    throw new Error(`YouTube RSS returned ${response.status}.`)
  }

  return parseYouTubeRssXml(await response.text())
}
