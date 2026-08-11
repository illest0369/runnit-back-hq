import { config } from 'dotenv'

import {
  createOpusSupabaseClient,
  probeRBWomenOpusAdapters,
  runRBWomenOpusPipeline,
  type OpusRunReport,
} from '../lib/rb-women-opus-pipeline'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : null
  return value && !value.startsWith('--') ? value.trim() : null
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name)
}

function parseSources(): string[] {
  const sources: string[] = []
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === '--source' && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
      sources.push(process.argv[index + 1])
    }
  }
  const csv = readArg('--sources')
  if (csv) {
    sources.push(...csv.split(',').map((item) => item.trim()).filter(Boolean))
  }
  return [...new Set(sources)]
}

function summarize(report: OpusRunReport) {
  return {
    result: report.result,
    sourceTitle: report.source.title,
    geminiCandidatesReturned: report.geminiCandidatesReturned,
    eligibleCandidates: report.eligibleCandidates,
    rejectedCandidates: report.rejectedCandidates,
    clipsSelected: report.clipsSelected,
    produced: report.clips.filter((clip) => Boolean(clip.clipId)).length,
    queueEligible: report.clips.filter((clip) => clip.queueEligible).length,
    publishableWithoutManualEditing: report.clips.filter((clip) => clip.publishableWithoutManualEditing).length,
    processingTimeSeconds: report.processingTimeSeconds,
    adapterStatus: report.adapterStatus,
    safety: report.safety,
    reportPath: report.reportPath,
    clips: report.clips.map((clip) => ({
      rank: clip.rank,
      candidateId: clip.candidateId,
      packageId: clip.packageId,
      clipId: clip.clipId,
      selectedStartSeconds: clip.selected.sceneAdjustedStartSeconds,
      selectedEndSeconds: clip.selected.sceneAdjustedEndSeconds,
      confidence: clip.selected.confidence,
      subject: clip.selected.subject,
      competition: clip.selected.competition,
      rbWomenLane: clip.selected.editorial.rbWomenLane,
      namedSearchEntities: clip.selected.editorial.namedSearchEntities,
      editorialScore: clip.selected.editorial.score,
      queueDiversity: clip.selected.editorial.queueDiversity,
      captionAccuracy: clip.captionAccuracy,
      verticalCropQuality: clip.verticalCropQuality,
      queueEligible: clip.queueEligible,
      publicUrlHttps: Boolean(clip.publicUrl?.startsWith('https://')),
      renderWidth: clip.quality?.width ?? null,
      renderHeight: clip.quality?.height ?? null,
      videoCodec: clip.quality?.videoCodec ?? null,
      audioCodec: clip.quality?.audioCodec ?? null,
      publishableWithoutManualEditing: clip.publishableWithoutManualEditing,
      failure: clip.failure,
    })),
  }
}

async function main() {
  if (hasFlag('--probe-adapters')) {
    console.log(JSON.stringify({
      result: 'PASS',
      probe: await probeRBWomenOpusAdapters(),
      note: 'Presence-only probe; no secret values, no media processing, no Metricool scheduling.',
    }, null, 2))
    return
  }
  const sources = parseSources()
  if (sources.length === 0) {
    throw new Error('Missing source. Use --source <local_mp4_or_url>. Repeat --source for the three-source acceptance test.')
  }
  const db = createOpusSupabaseClient()
  const reports: OpusRunReport[] = []
  for (const source of sources) {
    const report = await runRBWomenOpusPipeline(db, {
      source,
      title: readArg('--title'),
      assetRoot: readArg('--asset-root'),
      writeReport: hasFlag('--write-report'),
    })
    reports.push(report)
  }
  console.log(JSON.stringify({
    result: reports.filter((report) => report.result === 'PASS').length >= Math.min(2, reports.length) ? 'PASS' : 'FAIL',
    sourcesProcessed: reports.length,
    passedSources: reports.filter((report) => report.result === 'PASS').length,
    reports: reports.map(summarize),
    note: 'This pipeline uploads rendered MP4 assets to R2 through the existing platform bridge and stops before Metricool scheduling.',
  }, null, 2))
}

void main().catch((error) => {
  console.error(JSON.stringify({
    result: 'FAIL',
    error: error instanceof Error ? error.message : String(error),
  }, null, 2))
  process.exitCode = 1
})
