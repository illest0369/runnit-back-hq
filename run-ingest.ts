import { runIngestion } from './services/sourceIngestionService'

async function main() {
  try {
    console.log('[ingest] starting...')
    await runIngestion(process.env.INGEST_REQUESTED_BY_USER_ID ?? 'system')
    console.log('[ingest] done')
  } catch (err) {
    console.error('[ingest] error:', err)
  }
}

main()
