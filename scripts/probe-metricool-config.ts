import { config } from 'dotenv'

import {
  getMetricoolAuthDebugShape,
  getMetricoolConfigReport,
  validateMetricoolConnectivity,
} from '../lib/metricool'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

async function main() {
  const includeConnectivity = process.argv.includes('--connectivity')
  const includeAuthShape = process.argv.includes('--debug-auth-shape')
  const report = getMetricoolConfigReport()
  const connectivity = includeConnectivity
    ? await validateMetricoolConnectivity()
    : null
  const authShape = includeAuthShape
    ? getMetricoolAuthDebugShape()
    : null

  console.log(JSON.stringify(
    {
      result: 'PASS',
      metricool: report,
      connectivity,
      authShape,
      note: includeConnectivity
        ? 'Connectivity check made a safe read-only Metricool profile request when live credentials were complete.'
        : 'No network request was made. Pass --connectivity for a safe read-only auth check.',
    },
    null,
    2,
  ))
}

main().catch((error) => {
  console.error(JSON.stringify(
    {
      result: 'FAIL',
      error: error instanceof Error ? error.message : String(error),
    },
    null,
    2,
  ))
  process.exitCode = 1
})

export {}
