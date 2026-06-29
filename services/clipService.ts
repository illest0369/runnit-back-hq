import { rm, unlink } from 'node:fs/promises'
import path from 'node:path'

import { getSourceSuggestion, saveGeneratedClipRecord, updateProcessedVideoStatus, updateSourceSuggestionStatus } from '../lib/clip-worker-db'
import { getChannelMeta } from '../lib/channel-meta'
import { uploadGeneratedClip } from '../lib/clip-storage'
import { completeModerationClipRender, markModerationClipRenderFailed } from '../lib/clip-render'
import { parseFinalJudgeDecision } from '../lib/final-judge'
import { markGeneratedClipsReadyForPublish } from '../lib/publish-relay'
import { transitionClipState } from '../lib/state-machine'
import { validateSystemGuard } from '../lib/system-guard'
import {
  type ClipGenerationJobProgress,
  type ClipGenerationJobResult,
} from '../lib/queue'
import { scoreSegments, type ClipCandidate } from './segmentService'
import { getReplyLearningContext } from './learningService'
import { buildGeneratedPostPackage } from './postPackageService'
import { transcribeVideo } from './transcriptionService'
import {
  cutVerticalClip,
  downloadVideo,
  ensureClipDirectories,
  getGeneratedClipDir,
} from './videoService'

type GenerateClipInput = {
  jobId: string
  videoUrl: string
  channelId: string
  requestedByUserId: string
  sourceSuggestionId?: string | null
  moderationClipId?: string | null
}

type ProgressReporter = (progress: ClipGenerationJobProgress) => Promise<void> | void

type SavedClipRecord = {
  queueJobId: string
  postId: string
  hook: string
  caption: string
  hashtags: string[]
  recommendation: 'approve' | 'revise' | 'reject'
}

const MIN_CLIP_QUALITY_SCORE = 65

function toProgress(step: string, percent: number, message: string): ClipGenerationJobProgress {
  return {
    step,
    percent,
    message,
  }
}

async function saveGeneratedSegment(input: {
  clip: ClipCandidate
  channelId: string
  requestedByUserId: string
  sourceSuggestionId?: string | null
  sourceTitle?: string | null
  sourceVideoUrl: string
  publicClipUrl: string
  cdnUrl: string | null
  localUrl: string | null
}) {
  const packageAssets = buildGeneratedPostPackage({
    clip: input.clip,
    channel: getChannelMeta(input.channelId),
    sourceTitle: input.sourceTitle,
  })
  const saved = await saveGeneratedClipRecord({
    channelId: input.channelId,
    requestedByUserId: input.requestedByUserId,
    sourceSuggestionId: input.sourceSuggestionId ?? null,
    sourceVideoUrl: input.sourceVideoUrl,
    title: packageAssets.title,
    publicClipUrl: input.publicClipUrl,
    cdnUrl: input.cdnUrl,
    localUrl: input.localUrl,
    score: packageAssets.score,
    hook: packageAssets.hook,
    hookOptions: input.clip.hookOptions,
    caption: packageAssets.caption,
    hashtags: packageAssets.hashtags,
    riskNotes: packageAssets.riskNotes,
    recommendation: packageAssets.recommendation,
    viralReasoning: input.clip.viralReasoning,
    commentBait: input.clip.commentBait,
    replyType: input.clip.replyType,
    startTime: input.clip.start,
    endTime: input.clip.end,
    transcriptExcerpt: input.clip.text,
  })

  console.log('[db] post created', saved.postId, {
    status: 'GENERATED',
    video_url: input.publicClipUrl,
    hook: packageAssets.hook,
    recommendation: packageAssets.recommendation,
  })

  return {
    ...saved,
    hook: packageAssets.hook,
    caption: packageAssets.caption,
    hashtags: packageAssets.hashtags,
    recommendation: packageAssets.recommendation,
  } satisfies SavedClipRecord
}

async function cleanupPaths(paths: string[]) {
  await Promise.all(
    Array.from(new Set(paths)).map(async (targetPath) => {
      try {
        await unlink(targetPath)
      } catch {
        // Best-effort cleanup only.
      }
    }),
  )
}

async function cleanupLocalPublicUrl(localUrl: string | null) {
  if (!localUrl?.startsWith('/generated-clips/')) {
    return
  }

  const publicPath = path.join(process.cwd(), 'public', localUrl.replace(/^\/+/, ''))
  await cleanupPaths([publicPath])
}

export async function generateClipsFromVideo(
  input: GenerateClipInput,
  reportProgress?: ProgressReporter,
): Promise<ClipGenerationJobResult> {
  await ensureClipDirectories()
  await updateSourceSuggestionStatus(input.sourceSuggestionId, 'processing')
  await reportProgress?.(toProgress('download', 10, 'Downloading source video.'))

  let download: Awaited<ReturnType<typeof downloadVideo>> | null = null
  const localFiles: string[] = []

  try {
    download = await downloadVideo(input.videoUrl, input.jobId)
    console.log('[clip-service] video downloaded', {
      jobId: input.jobId,
      sourcePath: download.sourcePath,
    })
    const filePrefix = `${input.jobId}-${download.sourceId}`
    const generatedClipDir = getGeneratedClipDir()
    const learningContext = await getReplyLearningContext()
    const sourceSuggestion = input.sourceSuggestionId
      ? await getSourceSuggestion(input.sourceSuggestionId)
      : null

    await reportProgress?.(toProgress('transcribe', 30, 'Transcribing source video.'))
    const transcript = await transcribeVideo(download.sourcePath, download.workspaceTmpDir)
    console.log('[clip-service] transcription complete', {
      jobId: input.jobId,
      segments: transcript.segments.length,
    })

    await reportProgress?.(toProgress('segment', 45, 'Scoring real-world clip windows.'))
    const rankedClips = scoreSegments(transcript.segments, 3, learningContext)
    const selectedClips = rankedClips.filter((clip) => clip.score >= MIN_CLIP_QUALITY_SCORE)
    const clipsToProcess = (selectedClips.length > 0 ? selectedClips : rankedClips.slice(0, 1)).slice(0, 3)
    console.log('[clip-service] segments selected', {
      jobId: input.jobId,
      selected: clipsToProcess.length,
    })

    if (clipsToProcess.length === 0) {
      await updateProcessedVideoStatus(input.videoUrl, 'failed')
      throw new Error('No clip passed the quality gate.')
    }

    const savedRecords: SavedClipRecord[] = []
    let attachedModerationClip = false

    for (let index = 0; index < clipsToProcess.length; index += 1) {
      const clip = clipsToProcess[index]
      const filename = `${filePrefix}-clip-${index + 1}.mp4`
      const localOutputPath = path.join(generatedClipDir, filename)
      const storagePath = `${input.channelId}/${filename}`
      let localUrl: string | null = null

      localFiles.push(localOutputPath)
      localFiles.push(`${localOutputPath}.caption.png`)

      try {
        const progressPercent = 55 + Math.floor((index / clipsToProcess.length) * 30)
        await reportProgress?.(
          toProgress(
            'cut-upload',
            progressPercent,
            `Cutting and uploading clip ${index + 1} of ${clipsToProcess.length}.`,
          ),
        )

        await cutVerticalClip({
          inputPath: download.sourcePath,
          outputPath: localOutputPath,
          startTime: clip.start,
          endTime: clip.end,
          captionText: clip.text,
        })
        console.log('[clip-service] clips generated', {
          jobId: input.jobId,
          clipIndex: index + 1,
          outputPath: localOutputPath,
        })

        const upload = await uploadGeneratedClip(localOutputPath, storagePath)
        localUrl = upload.localUrl
        const packageAssets = buildGeneratedPostPackage({
          clip,
          channel: getChannelMeta(input.channelId),
          sourceTitle: sourceSuggestion?.source_title ?? null,
        })

        if (input.moderationClipId && !attachedModerationClip) {
          await completeModerationClipRender({
            clipId: input.moderationClipId,
            publicClipUrl: upload.publicUrl,
          })
          attachedModerationClip = true
          savedRecords.push({
            queueJobId: input.moderationClipId,
            postId: input.moderationClipId,
            hook: packageAssets.hook,
            caption: packageAssets.caption,
            hashtags: packageAssets.hashtags,
            recommendation: packageAssets.recommendation,
          })
          localUrl = null
          break
        }

        const saved = await saveGeneratedSegment({
          clip,
          channelId: input.channelId,
          requestedByUserId: input.requestedByUserId,
          sourceSuggestionId: input.sourceSuggestionId,
          sourceTitle: sourceSuggestion?.source_title ?? null,
          sourceVideoUrl: input.videoUrl,
          publicClipUrl: upload.publicUrl,
          cdnUrl: upload.cdnUrl,
          localUrl,
        })

        const guardResult = await validateSystemGuard({
          id: saved.postId,
          source_video_url: input.videoUrl,
          hook: saved.hook,
          caption: saved.caption,
          hashtags: saved.hashtags,
          aspect_ratio: '9:16',
          timestamp_start: clip.start,
          timestamp_end: clip.end,
        })

        if (!guardResult.ok) {
          if (process.env.WAR_ROOM_STRICT_STATES === 'true') {
            await transitionClipState({
              clipId: saved.postId,
              currentState: 'GENERATED',
              nextState: 'FAILED',
              actor: { type: 'system', id: 'system-guard' },
              reason: guardResult.reason,
            })
            throw new Error(`System Guard failed: ${guardResult.reason}`)
          }

          console.warn('[system-guard] non-strict guard failure allowed', {
            postId: saved.postId,
            reason: guardResult.reason,
          })
        }

        if (process.env.WAR_ROOM_STRICT_STATES === 'true') {
          await transitionClipState({
            clipId: saved.postId,
            currentState: 'GENERATED',
            nextState: 'GUARDED',
            actor: { type: 'system', id: 'system-guard' },
            reason: 'SYSTEM_GUARD_PASSED',
          })
          await transitionClipState({
            clipId: saved.postId,
            currentState: 'GUARDED',
            nextState: 'REVIEWED',
            actor: { type: 'system', id: 'system-guard' },
            reason: 'READY_FOR_REVIEW',
          })
        }
        const judgeDecision = await parseFinalJudgeDecision({
          value:
            saved.recommendation === 'approve'
              ? 'APPROVE'
              : saved.recommendation === 'reject'
                ? 'REJECT'
                : 'REVISE',
          clipId: saved.postId,
          postId: saved.postId,
          actor: 'ai:final-judge',
        })
        if (process.env.WAR_ROOM_STRICT_STATES === 'true') {
          await transitionClipState({
            clipId: saved.postId,
            currentState: 'REVIEWED',
            nextState: 'AI_DECISION',
            actor: { type: 'ai', id: 'final-judge' },
            reason: `FINAL_JUDGE_${judgeDecision}`,
          })
          if (judgeDecision === 'REJECT') {
            await transitionClipState({
              clipId: saved.postId,
              currentState: 'AI_DECISION',
              nextState: 'REJECTED',
              actor: { type: 'ai', id: 'final-judge' },
              reason: 'FINAL_JUDGE_REJECT',
            })
          } else if (judgeDecision === 'REVISE') {
            await transitionClipState({
              clipId: saved.postId,
              currentState: 'AI_DECISION',
              nextState: 'REVISE',
              actor: { type: 'ai', id: 'final-judge' },
              reason: 'FINAL_JUDGE_REVISE',
            })
          }
        }

        savedRecords.push(saved)
        console.log('[clip-service] db insert success', {
          jobId: input.jobId,
          queueJobId: saved.queueJobId,
          postId: saved.postId,
          storageMode: upload.storageMode,
          publicClipUrl: upload.publicUrl,
        })
        localUrl = null
      } catch (error) {
        await cleanupLocalPublicUrl(localUrl)
        console.error('[clip-pipeline] skipped segment', {
          jobId: input.jobId,
          index,
          start: clip.start,
          end: clip.end,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    if (savedRecords.length === 0) {
      await updateProcessedVideoStatus(input.videoUrl, 'failed')
      throw new Error('Every segment failed during cut, upload, or save.')
    }

    const selectedForPublish = input.moderationClipId
      ? null
      : await markGeneratedClipsReadyForPublish({
          postIds: savedRecords.map((record) => record.postId),
          channelId: input.channelId,
        })

    await updateProcessedVideoStatus(input.videoUrl, 'processed')
    await updateSourceSuggestionStatus(input.sourceSuggestionId, 'ready')
    await reportProgress?.(toProgress('complete', 100, 'Clip generation complete.'))
    console.log('[clip-service] completed job', {
      jobId: input.jobId,
      generatedCount: savedRecords.length,
      readyToPostId: selectedForPublish?.postId ?? null,
    })

    return {
      sourceVideoUrl: input.videoUrl,
      generatedCount: savedRecords.length,
      postIds: savedRecords.map((record) => record.postId),
      queueJobIds: savedRecords.map((record) => record.queueJobId),
    }
  } catch (error) {
    await markModerationClipRenderFailed(
      input.moderationClipId,
      error instanceof Error ? error.message : String(error),
    )
    await updateSourceSuggestionStatus(input.sourceSuggestionId, 'failed')
    throw error
  } finally {
    await cleanupPaths(localFiles)
    if (download) {
      await rm(download.workspaceTmpDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}
