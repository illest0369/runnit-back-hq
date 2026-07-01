import { config } from 'dotenv'
import { createServer, type Server } from 'http'
import { Worker } from 'bullmq'

import {
  CLIP_GENERATION_QUEUE_NAME,
  createWorkerConnection,
  type ClipGenerationJobData,
  type ClipGenerationJobResult,
} from '../lib/queue'
import { generateClipsFromVideo } from '../services/clipService'
import { createRbhqWorkers } from './rbhqWorker'

config({ path: '.env.local' })
config()

function startHealthServer(): Server | null {
  const port = process.env.PORT
  if (!port) {
    return null
  }

  const server = createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ ok: true, service: 'runnit-back-worker' }))
      return
    }

    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ ok: false, error: 'Not found' }))
  })

  server.listen(Number(port), '0.0.0.0', () => {
    console.log(`[clip-worker] health server listening on 0.0.0.0:${port}`)
  })

  return server
}

async function startWorker() {
  const healthServer = startHealthServer()
  console.log('[clip-worker] waiting for jobs')

  const worker = new Worker<ClipGenerationJobData, ClipGenerationJobResult, 'generate-clips'>(
    CLIP_GENERATION_QUEUE_NAME,
    async (job) => {
      console.log('[clip-worker] processing job', job.id)

      const result = await generateClipsFromVideo(
        {
          ...job.data,
          jobId: String(job.id),
        },
        async (progress) => {
          await job.updateProgress(progress)
        },
      )

      console.log('[clip-worker] completed', job.id)

      return result
    },
    {
      connection: createWorkerConnection(),
      concurrency: 2,
    },
  )

  worker.on('ready', () => {
    console.log(`[clip-worker] ready on queue "${CLIP_GENERATION_QUEUE_NAME}"`)
  })

  worker.on('failed', (job, error) => {
    console.error('[clip-worker] failed', job?.id ?? 'unknown', error)
  })

  worker.on('error', (error) => {
    console.error('[clip-worker] worker error:', error.message)
  })

  const rbhqWorkers = createRbhqWorkers()
  rbhqWorkers.forEach((rbhqWorker) => {
    rbhqWorker.on('ready', () => {
      console.log(`[rbhq-worker] ready on queue "${rbhqWorker.name}"`)
    })
    rbhqWorker.on('failed', (job, error) => {
      console.error('[rbhq-worker] failed', rbhqWorker.name, job?.id ?? 'unknown', error)
    })
    rbhqWorker.on('error', (error) => {
      console.error('[rbhq-worker] worker error:', rbhqWorker.name, error.message)
    })
  })

  async function shutdown(signal: string) {
    console.log(`[clip-worker] shutting down on ${signal}`)
    healthServer?.close()
    await worker?.close()
    await Promise.all(rbhqWorkers.map((rbhqWorker) => rbhqWorker.close()))
    process.exit(0)
  }

  process.on('SIGINT', () => {
    void shutdown('SIGINT')
  })

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM')
  })
}

startWorker().catch((error) => {
  console.error('[clip-worker] boot failed:', error)
  process.exit(1)
})
