import { config } from 'dotenv'

import { runRBWomenAutopilotNext } from '../lib/rb-women-autopilot-next'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

function hasFlag(name: string): boolean {
  return process.argv.includes(name)
}

async function main() {
  const report = await runRBWomenAutopilotNext({
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
