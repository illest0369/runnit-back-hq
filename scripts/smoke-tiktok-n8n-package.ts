import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

const execFileAsync = promisify(execFile)

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object.`)
  return value as Record<string, unknown>
}

async function main() {
  const run = await execFileAsync(
    './node_modules/.bin/tsx',
    ['scripts/smoke-tiktok-full-loop.ts'],
    { cwd: process.cwd(), maxBuffer: 1024 * 1024 * 8 },
  )
  const fullLoop = JSON.parse(run.stdout) as Record<string, unknown>
  assert(fullLoop.result === 'PASS', 'Full-loop smoke did not pass.')

  const payload = readObject(fullLoop.payload, 'payload')
  const media = readObject(payload.media, 'payload.media')
  const timing = readObject(payload.timing, 'payload.timing')
  const tiktokDraft = readObject(payload.tiktokDraft, 'payload.tiktokDraft')
  const finalClip = readObject(fullLoop.finalClip, 'finalClip')
  const n8n = readObject(fullLoop.n8n, 'n8n')

  assert(payload.targetPlatform === 'tiktok', 'Package target platform must be TikTok.')
  assert(payload.publishAction === 'dry_run', 'Package publish action must stay dry_run.')
  assert(payload.testMode === true, 'Package must be built in n8n test mode.')
  assert(typeof payload.mediaPath === 'string' && payload.mediaPath.endsWith('.mp4'), 'Package mediaPath must reference an MP4.')
  assert(payload.localPath === payload.mediaPath, 'Package localPath must match the rendered media path.')
  assert(media.durationSeconds === 15, 'Package duration must be present.')
  assert(media.width === 1080 && media.height === 1920, 'Package dimensions must be 1080x1920.')
  assert(typeof media.sizeBytes === 'number' && media.sizeBytes > 0, 'Package sizeBytes must be present.')
  assert(media.mimeType === 'video/mp4', 'Package MIME type must be video/mp4.')
  assert(media.format === 'mp4', 'Package format must be mp4.')
  assert(timing.startSeconds === 0 && timing.endSeconds === 15, 'Package must preserve transcript timing.')

  assert(tiktokDraft.clipId === fullLoop.promotedClipId, 'TikTok draft clip id mismatch.')
  assert(tiktokDraft.mediaPath === payload.mediaPath, 'TikTok draft media path mismatch.')
  assert(tiktokDraft.durationSeconds === media.durationSeconds, 'TikTok draft duration mismatch.')
  assert(tiktokDraft.width === media.width && tiktokDraft.height === media.height, 'TikTok draft dimensions mismatch.')
  assert(tiktokDraft.sizeBytes === media.sizeBytes, 'TikTok draft size mismatch.')
  assert(tiktokDraft.mimeType === 'video/mp4' && tiktokDraft.format === 'mp4', 'TikTok draft media format missing.')
  assert(typeof tiktokDraft.caption === 'string' && tiktokDraft.caption.length > 0, 'TikTok draft caption missing.')
  assert(Array.isArray(tiktokDraft.hashtags) && tiktokDraft.hashtags.length > 0, 'TikTok draft hashtags missing.')
  assert(typeof tiktokDraft.title === 'string' && tiktokDraft.title.length > 0, 'TikTok draft title missing.')
  assert(typeof tiktokDraft.hook === 'string' && tiktokDraft.hook.length > 0, 'TikTok draft hook missing.')
  assert(typeof tiktokDraft.sourceVideoUrl === 'string' && tiktokDraft.sourceVideoUrl.length > 0, 'TikTok draft source video missing.')
  assert(tiktokDraft.publishAction === 'dry_run' && tiktokDraft.testMode === true, 'TikTok draft must remain dry-run test mode.')

  assert(n8n.responseStatus === 200, 'n8n did not return HTTP 200.')
  assert(n8n.automationStatus === 'automation_queued', 'n8n did not acknowledge automation_queued.')
  assert(finalClip.status === 'approved', 'Final clip must remain approved.')
  assert(finalClip.publishStatus === 'automation_queued', 'Final clip must only record automation queued.')
  assert(finalClip.manuallyPublishedAt === null, 'Final clip must not be manually published.')
  assert(!['published', 'metricool_published', 'manually_published'].includes(String(finalClip.publishStatus)), 'Final clip was marked as published.')

  console.log(JSON.stringify(
    {
      result: 'PASS',
      promotedClipId: fullLoop.promotedClipId,
      renderedMp4Path: payload.mediaPath,
      n8n,
      tiktokDraft,
      finalClip,
      safety: {
        testMode: payload.testMode,
        publishAction: payload.publishAction,
        livePublishStateSet: false,
      },
    },
    null,
    2,
  ))
}

void main().catch((error) => {
  console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
