import { buildRBHQIntelligenceV1, type RBHQIntelligenceV1 } from './intelligence-v1'
import { syncCandidateIntelligenceV1ForLoadedData } from './candidate-intelligence'
import { readTimedSegments, type ScoutSegment } from './tiktok-clip-scout'
import type { SupabaseClient } from '@supabase/supabase-js'

export type ClipPrepStatus = 'ready' | 'metadata_only'
export type ClipPrepConfidence = 'high' | 'medium' | 'low'

export type ClipPrepV1 = {
  version: 'rbhq-clip-prep-v1'
  status: ClipPrepStatus
  confidence: ClipPrepConfidence
  suggested_clip_start_seconds: number | null
  suggested_clip_end_seconds: number | null
  suggested_clip_length_seconds: number | null
  clip_reason: string
  opening_text: string
  edit_notes: string[]
  asset_instructions: string
  basis: {
    transcript_available: boolean
    timed_transcript_available: boolean
    transcript_source: string | null
    source_title: string
    source_name: string
    published_at: string | null
    intelligence: Pick<RBHQIntelligenceV1, 'score' | 'rankLabel' | 'urgency' | 'reasons' | 'whyNow'>
  }
  safety: {
    downloads_video: false
    renders_video: false
    uploads_video: false
    posts_video: false
  }
}

export type ClipPrepCandidateInput = {
  id?: string | null
  title: string
  summary?: string | null
  hook_text?: string | null
  caption?: string | null
  hashtags?: string[] | null
  start_seconds?: number | string | null
  end_seconds?: number | string | null
  score?: number | string | null
  score_breakdown?: Record<string, unknown> | null
  target_channel_id?: string | null
}

export type ClipPrepVideoInput = {
  id?: string | null
  title: string
  description?: string | null
  video_url?: string | null
  published_at?: string | null
  duration_seconds?: number | string | null
}

export type ClipPrepSourceInput = {
  display_name?: string | null
  target_rbhq_channel_id?: string | null
}

export type ClipPrepTranscriptInput = {
  transcript_source: string
  transcript_text: string | null
  transcript_json: unknown
  language?: string | null
} | null

type ClipPrepDb = Pick<SupabaseClient, 'from'>

type ClipPrepCandidateRow = ClipPrepCandidateInput & {
  id: string
  ingested_video_id: string
}

type ClipPrepVideoRow = ClipPrepVideoInput & {
  id: string
  source_channel_id: string | null
}

type ClipPrepSourceRow = ClipPrepSourceInput & {
  id: string
}

type ClipPrepPackageRow = {
  id: string
  clip_candidate_id: string
  package_payload: Record<string, unknown>
  edit_notes: string[] | null
}

export type ClipPrepRefreshResult = {
  candidateId: string
  packageId: string | null
  clipPrep: ClipPrepV1
  transcript: {
    available: boolean
    timed: boolean
    source: string | null
  }
  safety: {
    downloadsVideo: false
    rendersVideo: false
    uploadsVideo: false
    postsVideo: false
  }
}

function compact(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

function truncate(value: string, maxLength: number): string {
  const clean = compact(value)
  if (clean.length <= maxLength) return clean
  return `${clean.slice(0, maxLength - 3).trim()}...`
}

function readNumber(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function roundSeconds(value: number | null): number | null {
  return value === null ? null : Number(value.toFixed(3))
}

function firstString(value: unknown): string {
  return typeof value === 'string' ? compact(value) : ''
}

function readBreakdownArray(breakdown: Record<string, unknown> | null | undefined, key: string): string[] {
  const value = breakdown?.[key]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(compact)
    : []
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of values.map(compact).filter(Boolean)) {
    if (seen.has(value)) continue
    seen.add(value)
    output.push(value)
  }
  return output
}

function validRange(start: number | null, end: number | null): { start: number; end: number } | null {
  if (start === null || end === null || end <= start) return null
  return { start, end }
}

function textWithinRange(segments: ScoutSegment[], start: number, end: number): string {
  return compact(segments
    .filter((segment) => segment.end > start && segment.start < end)
    .map((segment) => segment.text)
    .join(' '))
}

function chooseTranscriptRange(segments: ScoutSegment[]): { start: number; end: number; text: string } | null {
  if (segments.length === 0) return null
  const start = segments[0]?.start ?? 0
  let end = start
  const lines: string[] = []
  for (const segment of segments) {
    if (segment.start - start > 45) break
    lines.push(segment.text)
    end = segment.end
    if (end - start >= 18) break
  }
  if (end <= start) return null
  return { start, end, text: compact(lines.join(' ')) }
}

function openingFrom(input: {
  candidate: ClipPrepCandidateInput
  transcriptWindowText: string
  intelligence: RBHQIntelligenceV1
  sourceTitle: string
}): string {
  return truncate(
    compact(input.candidate.hook_text) ||
      compact(input.transcriptWindowText) ||
      input.intelligence.hook ||
      input.sourceTitle ||
      input.candidate.title,
    140,
  )
}

function statusAndConfidence(input: {
  hasTranscript: boolean
  hasTimedTranscript: boolean
  hasCandidateRange: boolean
}): { status: ClipPrepStatus; confidence: ClipPrepConfidence } {
  if (input.hasTimedTranscript && input.hasCandidateRange) return { status: 'ready', confidence: 'high' }
  if (input.hasTimedTranscript) return { status: 'ready', confidence: 'medium' }
  if (input.hasTranscript) return { status: 'metadata_only', confidence: 'medium' }
  return { status: 'metadata_only', confidence: 'low' }
}

export function buildClipPrepV1(input: {
  candidate: ClipPrepCandidateInput
  video: ClipPrepVideoInput
  source?: ClipPrepSourceInput | null
  transcript?: ClipPrepTranscriptInput
}): ClipPrepV1 {
  const candidate = input.candidate
  const video = input.video
  const sourceName = compact(input.source?.display_name) || 'RBHQ Source'
  const sourceTitle = compact(video.title) || compact(candidate.title) || 'Untitled source'
  const transcript = input.transcript ?? null
  const segments = transcript ? readTimedSegments(transcript.transcript_json) : []
  const transcriptText = compact(transcript?.transcript_text) || compact(segments.map((segment) => segment.text).join(' '))
  const candidateRange = validRange(readNumber(candidate.start_seconds), readNumber(candidate.end_seconds))
  const selectedRange = candidateRange ?? chooseTranscriptRange(segments)
  const start = selectedRange ? roundSeconds(selectedRange.start) : null
  const end = selectedRange ? roundSeconds(selectedRange.end) : null
  const length = selectedRange ? roundSeconds(selectedRange.end - selectedRange.start) : null
  const selectedRangeText = selectedRange && 'text' in selectedRange && typeof selectedRange.text === 'string'
    ? selectedRange.text
    : ''
  const transcriptWindowText = selectedRange
    ? textWithinRange(segments, selectedRange.start, selectedRange.end) || selectedRangeText
    : ''
  const intelligence = buildRBHQIntelligenceV1({
    id: candidate.id,
    channel_id: candidate.target_channel_id ?? input.source?.target_rbhq_channel_id ?? null,
    title: candidate.title || sourceTitle,
    hook: candidate.hook_text,
    source_title: sourceTitle,
    source_name: sourceName,
    source_type: 'youtube_rss',
    description: video.description,
    transcript: transcriptWindowText || transcriptText || null,
    duration_seconds: length ?? readNumber(video.duration_seconds),
    ai_score: readNumber(candidate.score),
    virality_score: readNumber(candidate.score),
    hook_strength: readNumber(candidate.score),
    published_at: video.published_at,
  })
  const status = statusAndConfidence({
    hasTranscript: Boolean(transcriptText),
    hasTimedTranscript: segments.length > 0,
    hasCandidateRange: Boolean(candidateRange),
  })
  const opening = openingFrom({ candidate, transcriptWindowText, intelligence, sourceTitle })
  const reasons = [
    firstString(candidate.score_breakdown?.whyNow),
    firstString(candidate.score_breakdown?.operatorSummary),
    ...readBreakdownArray(candidate.score_breakdown, 'reasons'),
    intelligence.whyNow,
    ...intelligence.reasons,
  ].filter(Boolean)
  const clipReason = truncate(
    reasons[0] ||
      compact(candidate.summary) ||
      `${sourceName} source has a ${intelligence.rankLabel} ${intelligence.urgency} Clip Prep signal.`,
    260,
  )
  const editNotes = [
    start !== null && end !== null ? `Suggested manual cut: ${start}s-${end}s (${length}s).` : '',
    transcriptWindowText ? `Open on: ${truncate(transcriptWindowText, 180)}` : '',
    `Opening text: ${opening}`,
    `Clip reason: ${clipReason}`,
    status.status === 'metadata_only'
      ? 'Metadata-only prep: transcript timing was unavailable, so verify the strongest moment manually before cutting.'
      : 'Transcript-backed prep: verify timing against the local MP4 before cutting.',
    'Manual QA only: do not download, render, upload, post, or click final Post from Clip Prep.',
  ].filter(Boolean)

  return {
    version: 'rbhq-clip-prep-v1',
    status: status.status,
    confidence: status.confidence,
    suggested_clip_start_seconds: start,
    suggested_clip_end_seconds: end,
    suggested_clip_length_seconds: length,
    clip_reason: clipReason,
    opening_text: opening,
    edit_notes: editNotes,
    asset_instructions: start !== null && end !== null
      ? `Manually provide a local MP4 asset, then cut ${start}s-${end}s after human review. No automated download or render is performed.`
      : 'Manually inspect the source and provide a local MP4 asset. Transcript timing is unavailable, so choose the cut by hand. No automated download or render is performed.',
    basis: {
      transcript_available: Boolean(transcriptText),
      timed_transcript_available: segments.length > 0,
      transcript_source: transcript?.transcript_source ?? null,
      source_title: sourceTitle,
      source_name: sourceName,
      published_at: video.published_at ?? null,
      intelligence: {
        score: intelligence.score,
        rankLabel: intelligence.rankLabel,
        urgency: intelligence.urgency,
        reasons: intelligence.reasons,
        whyNow: intelligence.whyNow,
      },
    },
    safety: {
      downloads_video: false,
      renders_video: false,
      uploads_video: false,
      posts_video: false,
    },
  }
}

export function readClipPrepV1(value: unknown): ClipPrepV1 | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<ClipPrepV1>
  if (record.version !== 'rbhq-clip-prep-v1') return null
  if (record.status !== 'ready' && record.status !== 'metadata_only') return null
  return record as ClipPrepV1
}

export function readClipPrepFromCandidate(candidate: {
  score_breakdown?: Record<string, unknown> | null
  clip_prep?: unknown
}): ClipPrepV1 | null {
  return readClipPrepV1(candidate.clip_prep) ?? readClipPrepV1(candidate.score_breakdown?.clipPrep)
}

export function clipPrepCandidateUpdate(prep: ClipPrepV1, scoreBreakdown: Record<string, unknown> | null | undefined) {
  return {
    suggested_clip_start_seconds: prep.suggested_clip_start_seconds,
    suggested_clip_end_seconds: prep.suggested_clip_end_seconds,
    suggested_clip_length_seconds: prep.suggested_clip_length_seconds,
    clip_reason: prep.clip_reason,
    opening_text: prep.opening_text,
    edit_notes: prep.edit_notes,
    asset_instructions: prep.asset_instructions,
    clip_prep_status: prep.status,
    clip_prep_confidence: prep.confidence,
    clip_prep: prep,
    score_breakdown: {
      ...(scoreBreakdown ?? {}),
      clipPrep: prep,
    },
  }
}

function packagePayloadWithClipPrep(payload: Record<string, unknown>, prep: ClipPrepV1): Record<string, unknown> {
  const draft = payload.tiktokDraft && typeof payload.tiktokDraft === 'object'
    ? payload.tiktokDraft as Record<string, unknown>
    : null
  const draftNotes = Array.isArray(draft?.editNotes)
    ? draft.editNotes.filter((item): item is string => typeof item === 'string')
    : []

  return {
    ...payload,
    clipPrep: prep,
    tiktokDraft: draft
      ? {
          ...draft,
          editNotes: uniqueStrings([
            ...draftNotes,
            `clip_prep_status:${prep.status}`,
            `clip_prep_confidence:${prep.confidence}`,
            ...prep.edit_notes,
          ]),
        }
      : payload.tiktokDraft,
  }
}

async function findPackageForClipPrep(
  supabase: ClipPrepDb,
  input: { candidateId: string; packageId?: string | null },
): Promise<ClipPrepPackageRow | null> {
  const query = supabase
    .from('mac_mini_clip_packages')
    .select('id, clip_candidate_id, package_payload, edit_notes')

  const { data, error } = input.packageId
    ? await query.eq('id', input.packageId).single()
    : await query.eq('clip_candidate_id', input.candidateId).maybeSingle()

  if (error) throw new Error(error.message)
  return data ? data as unknown as ClipPrepPackageRow : null
}

export async function refreshClipPrepForCandidate(
  supabase: ClipPrepDb,
  candidateId: string,
  input: { packageId?: string | null; now?: () => Date } = {},
): Promise<ClipPrepRefreshResult> {
  const { data: candidateData, error: candidateError } = await supabase
    .from('clip_candidates')
    .select(
      `id, ingested_video_id, target_channel_id, start_seconds, end_seconds, title, summary, hook_text, caption, hashtags, score, score_breakdown,
       suggested_clip_start_seconds, suggested_clip_end_seconds, suggested_clip_length_seconds, clip_reason, opening_text, edit_notes,
       asset_instructions, clip_prep_status, clip_prep_confidence`,
    )
    .eq('id', candidateId)
    .single()
  if (candidateError || !candidateData) {
    throw new Error(candidateError?.message || 'Clip candidate not found.')
  }

  const candidate = candidateData as ClipPrepCandidateRow
  const { data: videoData, error: videoError } = await supabase
    .from('ingested_videos')
    .select('id, source_channel_id, title, description, video_url, published_at, duration_seconds')
    .eq('id', candidate.ingested_video_id)
    .single()
  if (videoError || !videoData) {
    throw new Error(videoError?.message || 'Ingested video not found.')
  }

  const video = videoData as ClipPrepVideoRow
  let source: ClipPrepSourceRow | null = null
  if (video.source_channel_id) {
    const { data: sourceData, error: sourceError } = await supabase
      .from('source_channels')
      .select('id, display_name, target_rbhq_channel_id')
      .eq('id', video.source_channel_id)
      .maybeSingle()
    if (sourceError) throw new Error(sourceError.message)
    source = sourceData as ClipPrepSourceRow | null
  }

  const nowDate = (input.now ?? (() => new Date()))()
  const intelligenceSync = await syncCandidateIntelligenceV1ForLoadedData(supabase, {
    candidate,
    video: {
      id: video.id,
      title: video.title,
      description: video.description,
      video_url: video.video_url,
      published_at: video.published_at,
      duration_seconds: video.duration_seconds,
      source_channels: source,
    },
    source,
    now: () => nowDate,
  })
  Object.assign(candidate, intelligenceSync.update)

  const { data: transcriptData, error: transcriptError } = await supabase
    .from('video_transcripts')
    .select('transcript_source, transcript_text, transcript_json, language')
    .eq('ingested_video_id', video.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (transcriptError) throw new Error(transcriptError.message)

  const transcript = transcriptData as ClipPrepTranscriptInput
  const prep = buildClipPrepV1({ candidate, video, source, transcript })
  const now = nowDate.toISOString()

  const { error: updateCandidateError } = await supabase
    .from('clip_candidates')
    .update({
      ...clipPrepCandidateUpdate(prep, candidate.score_breakdown),
      updated_at: now,
    })
    .eq('id', candidate.id)
  if (updateCandidateError) throw new Error(updateCandidateError.message)

  const pkg = await findPackageForClipPrep(supabase, { candidateId: candidate.id, packageId: input.packageId })
  if (pkg) {
    const payload = packagePayloadWithClipPrep(pkg.package_payload ?? {}, prep)
    const editNotes = uniqueStrings([
      ...(pkg.edit_notes ?? []),
      `clip_prep_status:${prep.status}`,
      `clip_prep_confidence:${prep.confidence}`,
      ...prep.edit_notes,
    ])
    const { error: packageError } = await supabase
      .from('mac_mini_clip_packages')
      .update({
        package_payload: payload,
        edit_notes: editNotes,
        updated_at: now,
      })
      .eq('id', pkg.id)
    if (packageError) throw new Error(packageError.message)
  }

  return {
    candidateId: candidate.id,
    packageId: pkg?.id ?? null,
    clipPrep: prep,
    transcript: {
      available: prep.basis.transcript_available,
      timed: prep.basis.timed_transcript_available,
      source: prep.basis.transcript_source,
    },
    safety: {
      downloadsVideo: false,
      rendersVideo: false,
      uploadsVideo: false,
      postsVideo: false,
    },
  }
}
