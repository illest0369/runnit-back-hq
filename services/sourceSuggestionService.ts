import { saveSourceSuggestion } from '../lib/clip-db'
import { runCommand } from './processService'

type SourceMetadata = {
  title: string
  author: string | null
  durationSeconds: number | null
  thumbnailUrl: string | null
  raw: Record<string, unknown>
}

const VIRAL_TITLE_WORDS = [
  'insane',
  'wild',
  'crazy',
  'heated',
  'shocking',
  'breakdown',
  'reaction',
  'fight',
  'rivalry',
  'upset',
  'playoff',
  'transfer',
  'recruit',
  'coach',
]

function toNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  return value
}

function toStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function fetchYouTubeMetadata(sourceUrl: string): Promise<SourceMetadata> {
  const { stdout } = await runCommand('yt-dlp', [
    '--dump-single-json',
    '--skip-download',
    '--no-playlist',
    sourceUrl,
  ])
  const parsed = JSON.parse(stdout) as Record<string, unknown>

  return {
    title: toStringValue(parsed.title) ?? sourceUrl,
    author: toStringValue(parsed.channel) ?? toStringValue(parsed.uploader),
    durationSeconds: toNumber(parsed.duration),
    thumbnailUrl: toStringValue(parsed.thumbnail),
    raw: {
      id: parsed.id,
      webpage_url: parsed.webpage_url,
      channel: parsed.channel,
      uploader: parsed.uploader,
      duration: parsed.duration,
      view_count: parsed.view_count,
      upload_date: parsed.upload_date,
    },
  }
}

function scoreInitialViralPotential(metadata: SourceMetadata) {
  const normalizedTitle = metadata.title.toLowerCase()
  let score = 45
  const reasoning: string[] = []
  const titleHits = VIRAL_TITLE_WORDS.filter((word) => normalizedTitle.includes(word))

  if (titleHits.length > 0) {
    score += Math.min(25, titleHits.length * 7)
    reasoning.push(`Title contains viral signal words: ${titleHits.join(', ')}.`)
  }

  if (metadata.author) {
    score += 8
    reasoning.push(`Recognizable source channel: ${metadata.author}.`)
  }

  if (metadata.durationSeconds && metadata.durationSeconds >= 30 && metadata.durationSeconds <= 900) {
    score += 10
    reasoning.push('Source duration is suitable for finding short-form moments.')
  }

  if (/\b[A-Z][a-zA-Z]{2,}\b/.test(metadata.title)) {
    score += 7
    reasoning.push('Title includes a named person, team, show, or event anchor.')
  }

  if (reasoning.length === 0) {
    reasoning.push('Initial score is based on available metadata only.')
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    reasoning,
  }
}

export async function createSourceSuggestion(input: {
  channelId: string
  operatorId: string
  sourceUrl: string
}) {
  let metadata: SourceMetadata

  try {
    metadata = await fetchYouTubeMetadata(input.sourceUrl)
  } catch (error) {
    metadata = {
      title: input.sourceUrl,
      author: null,
      durationSeconds: null,
      thumbnailUrl: null,
      raw: {
        metadata_error: error instanceof Error ? error.message : String(error),
      },
    }
  }

  const scored = scoreInitialViralPotential(metadata)
  const sourceSuggestionId = saveSourceSuggestion({
    channelId: input.channelId,
    operatorId: input.operatorId,
    sourceUrl: input.sourceUrl,
    title: metadata.title,
    author: metadata.author,
    durationSeconds: metadata.durationSeconds,
    thumbnailUrl: metadata.thumbnailUrl,
    initialScore: scored.score,
    reasoning: scored.reasoning,
    metadata: metadata.raw,
  })

  return {
    sourceSuggestionId,
    metadata,
    initialScore: scored.score,
    reasoning: scored.reasoning,
  }
}
