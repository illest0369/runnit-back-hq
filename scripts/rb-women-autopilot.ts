import { config } from 'dotenv'

import { runRBWomenAutopilot } from '../lib/rb-women-autopilot'

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

async function main() {
  const report = await runRBWomenAutopilot({
    sourceId: readArg('--source-id'),
    sourcePath: readArg('--source-path'),
    assetRoot: readArg('--asset-root'),
    runId: readArg('--run-id'),
    dryRun: hasFlag('--dry-run'),
    writeReport: hasFlag('--write-report'),
  })

  console.log(JSON.stringify(report, null, 2))
}

void main().catch((error) => {
  console.error(JSON.stringify({
    result: 'FAIL',
    error: error instanceof Error ? error.message : String(error),
  }, null, 2))
  process.exitCode = 1
})
