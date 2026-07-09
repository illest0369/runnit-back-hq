import assert from 'node:assert/strict'

import { buildClipPrepV1, refreshClipPrepForCandidate } from '../lib/clip-prep'

type Row = Record<string, unknown>
type TableName = 'clip_candidates' | 'ingested_videos' | 'source_channels' | 'video_transcripts' | 'mac_mini_clip_packages'

class MemoryQuery {
  private filters: Array<{ key: string; value: unknown }> = []
  private limitCount: number | null = null
  private updatePayload: Row | null = null

  constructor(
    private readonly db: MemorySupabase,
    private readonly table: TableName,
  ) {}

  select() {
    return this
  }

  eq(key: string, value: unknown) {
    this.filters.push({ key, value })
    return this
  }

  order() {
    return this
  }

  limit(count: number) {
    this.limitCount = count
    return this
  }

  update(payload: Row) {
    this.updatePayload = payload
    return this
  }

  private rows(): Row[] {
    return this.db.rows(this.table)
      .filter((row) => this.filters.every((filter) => row[filter.key] === filter.value))
      .slice(0, this.limitCount ?? undefined)
  }

  async maybeSingle() {
    const row = this.rows()[0] ?? null
    return { data: row, error: null }
  }

  async single() {
    if (this.updatePayload) {
      const row = this.rows()[0] ?? null
      if (!row) return { data: null, error: { message: 'Row not found.' } }
      Object.assign(row, this.updatePayload)
      return { data: row, error: null }
    }

    const row = this.rows()[0] ?? null
    if (!row) return { data: null, error: { message: 'Row not found.' } }
    return { data: row, error: null }
  }

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    if (this.updatePayload) {
      for (const row of this.rows()) {
        Object.assign(row, this.updatePayload)
      }
    }
    return Promise.resolve({ data: this.rows(), error: null }).then(onfulfilled, onrejected)
  }
}

class MemorySupabase {
  constructor(private readonly tables: Record<TableName, Row[]>) {}

  from(table: string) {
    assert.ok(
      table === 'clip_candidates' ||
        table === 'ingested_videos' ||
        table === 'source_channels' ||
        table === 'video_transcripts' ||
        table === 'mac_mini_clip_packages',
      `Unexpected table access: ${table}`,
    )
    return new MemoryQuery(this, table)
  }

  rows(table: TableName) {
    return this.tables[table]
  }
}

function packagePayload(candidateId: string) {
  return {
    version: 'rbhq-mac-mini-clip-package-v1',
    targetPlatform: 'tiktok',
    publishAction: 'dry_run',
    testMode: true,
    packageId: 'package-timed',
    candidateId,
    tiktokDraft: {
      caption: 'EDITORIAL CAPTION MUST STAY',
      hashtags: ['#Editorial', '#KeepMe'],
      editNotes: ['Existing operator note.'],
      publishAction: 'dry_run',
      testMode: true,
    },
    safety: {
      livePostingAllowed: false,
      metricoolAllowed: false,
      schedulerDependencyAllowed: false,
      operatorCredentialsRequired: false,
      finalPostClickAllowed: false,
    },
  }
}

async function main() {
  let fetchCalls = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    fetchCalls += 1
    throw new Error('Smoke test forbids network calls.')
  }) as typeof fetch

  try {
    const freshPublishedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const transcriptSegments = [
      { start: 3, duration: 7, end: 10, text: 'The rookie answers the pressure right away.' },
      { start: 10, duration: 8, end: 18, text: 'The crowd is stunned as the comeback starts.' },
      { start: 18, duration: 7, end: 25, text: 'The final play turns into a clutch finish.' },
    ]
    const db = new MemorySupabase({
      clip_candidates: [
        {
          id: 'candidate-timed',
          ingested_video_id: 'video-timed',
          target_channel_id: 'a1000000-0000-0000-0000-000000000001',
          start_seconds: 3,
          end_seconds: 25,
          title: 'Rookie answers pressure with clutch comeback finish',
          summary: 'STALE operator summary',
          hook_text: 'The crowd is stunned as the comeback starts',
          caption: 'STALE CANDIDATE CAPTION',
          hashtags: ['#StaleCandidate'],
          score: 10,
          score_breakdown: {
            model: 'stale_fixture',
            rankLabel: 'low_priority',
            urgency: 'hold',
            whyNow: 'STALE why now',
            operatorSummary: 'STALE operator summary',
            reasons: ['STALE reason'],
          },
          status: 'approved_for_handoff',
        },
        {
          id: 'candidate-metadata',
          ingested_video_id: 'video-metadata',
          target_channel_id: 'a1000000-0000-0000-0000-000000000001',
          start_seconds: null,
          end_seconds: null,
          title: 'Breaking trade reaction after playoff upset',
          summary: 'Metadata-only candidate when transcript is unavailable.',
          hook_text: null,
          caption: 'Metadata caption stays put',
          hashtags: ['#TradeTalk'],
          score: 78,
          score_breakdown: null,
          status: 'candidate',
        },
      ],
      ingested_videos: [
        {
          id: 'video-timed',
          source_channel_id: 'source-sports',
          title: 'Full rookie comeback interview',
          description: 'A rookie answers pressure after a clutch comeback finish.',
          video_url: 'https://www.youtube.com/watch?v=CLIPPREPTIMED',
          published_at: freshPublishedAt,
          duration_seconds: 180,
        },
        {
          id: 'video-metadata',
          source_channel_id: 'source-sports',
          title: 'Breaking trade reaction after playoff upset',
          description: 'No transcript available in this smoke path.',
          video_url: 'https://www.youtube.com/watch?v=CLIPPREPMETA',
          published_at: '2026-07-09T15:15:00.000Z',
          duration_seconds: 240,
        },
      ],
      source_channels: [
        {
          id: 'source-sports',
          display_name: 'ESPN',
          target_rbhq_channel_id: 'a1000000-0000-0000-0000-000000000001',
        },
      ],
      video_transcripts: [
        {
          ingested_video_id: 'video-timed',
          transcript_source: 'fixture-timed-transcript',
          transcript_text: transcriptSegments.map((segment) => segment.text).join(' '),
          transcript_json: transcriptSegments,
          language: 'en',
          created_at: '2026-07-09T15:20:00.000Z',
        },
      ],
      mac_mini_clip_packages: [
        {
          id: 'package-timed',
          clip_candidate_id: 'candidate-timed',
          package_payload: packagePayload('candidate-timed'),
          edit_notes: ['Existing operator note.'],
        },
      ],
    })

    const timed = await refreshClipPrepForCandidate(db as never, 'candidate-timed', {
      packageId: 'package-timed',
      now: () => new Date('2026-07-09T16:00:00.000Z'),
    })
    assert.equal(timed.clipPrep.status, 'ready')
    assert.equal(timed.clipPrep.confidence, 'high')
    assert.equal(timed.clipPrep.suggested_clip_start_seconds, 3)
    assert.equal(timed.clipPrep.suggested_clip_end_seconds, 25)
    assert.equal(timed.clipPrep.suggested_clip_length_seconds, 22)
    assert.equal(timed.transcript.available, true)
    assert.equal(timed.transcript.timed, true)
    assert.equal(timed.clipPrep.safety.downloads_video, false)
    assert.equal(timed.clipPrep.safety.renders_video, false)
    assert.equal(timed.clipPrep.safety.uploads_video, false)
    assert.equal(timed.clipPrep.safety.posts_video, false)

    const timedCandidate = db.rows('clip_candidates')[0]
    assert.equal(timedCandidate?.clip_prep_status, 'ready')
    assert.equal(timedCandidate?.clip_prep_confidence, 'high')
    assert.notEqual(timedCandidate?.caption, 'STALE CANDIDATE CAPTION')
    assert.ok(String(timedCandidate?.caption).includes('Quick review:'))
    assert.ok(Array.isArray(timedCandidate?.hashtags) && timedCandidate.hashtags.length > 1)
    assert.ok(Number(timedCandidate?.score) > 10)
    assert.equal((timedCandidate?.score_breakdown as Record<string, unknown>)?.model, 'rbhq_intelligence_v1')
    assert.equal((timedCandidate?.score_breakdown as Record<string, unknown>)?.urgency, 'post_now')

    const timedPackage = db.rows('mac_mini_clip_packages')[0]
    const payload = timedPackage?.package_payload as Record<string, unknown>
    const draft = payload.tiktokDraft as Record<string, unknown>
    assert.equal((payload.clipPrep as Record<string, unknown>)?.status, 'ready')
    assert.equal(draft.caption, 'EDITORIAL CAPTION MUST STAY')
    assert.deepEqual(draft.hashtags, ['#Editorial', '#KeepMe'])

    const metadata = await refreshClipPrepForCandidate(db as never, 'candidate-metadata', {
      now: () => new Date('2026-07-09T16:05:00.000Z'),
    })
    assert.equal(metadata.clipPrep.status, 'metadata_only')
    assert.equal(metadata.clipPrep.confidence, 'low')
    assert.equal(metadata.clipPrep.suggested_clip_start_seconds, null)
    assert.equal(metadata.clipPrep.suggested_clip_end_seconds, null)
    assert.ok(metadata.clipPrep.edit_notes.some((note) => note.includes('Metadata-only prep')))
    assert.equal(metadata.transcript.available, false)

    const pureMetadata = buildClipPrepV1({
      candidate: {
        title: 'Breaking trade reaction after playoff upset',
        score: 78,
      },
      video: {
        title: 'Breaking trade reaction after playoff upset',
        description: 'Metadata-only pure builder check.',
        published_at: '2026-07-09T15:15:00.000Z',
      },
      source: {
        display_name: 'ESPN',
        target_rbhq_channel_id: 'a1000000-0000-0000-0000-000000000001',
      },
      transcript: null,
    })
    assert.equal(pureMetadata.status, 'metadata_only')
    assert.equal(pureMetadata.confidence, 'low')

    assert.equal(fetchCalls, 0)

    console.log(JSON.stringify({
      result: 'PASS',
      transcriptBacked: {
        status: timed.clipPrep.status,
        confidence: timed.clipPrep.confidence,
        suggestedStart: timed.clipPrep.suggested_clip_start_seconds,
        suggestedEnd: timed.clipPrep.suggested_clip_end_seconds,
        openingText: timed.clipPrep.opening_text,
        clipReason: timed.clipPrep.clip_reason,
      },
      metadataOnly: {
        status: metadata.clipPrep.status,
        confidence: metadata.clipPrep.confidence,
        suggestedStart: metadata.clipPrep.suggested_clip_start_seconds,
        suggestedEnd: metadata.clipPrep.suggested_clip_end_seconds,
        assetInstructions: metadata.clipPrep.asset_instructions,
      },
      precedence: {
        captionPreserved: draft.caption,
        hashtagsPreserved: draft.hashtags,
      },
      safety: {
        networkCalls: fetchCalls,
        downloadsVideo: false,
        rendersVideo: false,
        uploadsVideo: false,
        postsVideo: false,
        metricoolCalls: false,
        n8nCalls: false,
        finalPostClicks: false,
      },
    }, null, 2))
  } finally {
    globalThis.fetch = originalFetch
  }
}

void main().catch((error) => {
  console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
