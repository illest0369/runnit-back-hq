import { readFileSync } from 'node:fs'

import {
  assertMetricoolSchedulerContract,
  buildMetricoolNormalizeHeaders,
  buildMetricoolSchedulerEndpointPreview,
  buildMetricoolSchedulerHeaders,
  buildSchedulerPayload,
  formatMetricoolDateTimeForTimezone,
  metricoolSchedulerError,
  sanitizeMetricoolDiagnostic,
} from '../lib/metricool'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function readObject(value: unknown): Record<string, unknown> {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Expected object.')
  return value as Record<string, unknown>
}

function main() {
  process.env.METRICOOL_TIMEZONE = 'America/Los_Angeles'
  const normalizedMediaId = 'https://app.metricool.com/media/normalized/rbhq-test.mp4'
  const normalizeHeaders = buildMetricoolNormalizeHeaders('fake-token')
  assert(normalizeHeaders['X-Mc-Auth'] === 'fake-token', 'Normalize headers must include X-Mc-Auth.')
  assert(!('Accept' in normalizeHeaders), 'Normalize request must not request application/json only.')
  assert(!('Content-Type' in normalizeHeaders), 'Normalize GET must not send Content-Type.')

  const schedulerHeaders = buildMetricoolSchedulerHeaders('fake-token')
  assert(schedulerHeaders['X-Mc-Auth'] === 'fake-token', 'Scheduler headers must include X-Mc-Auth.')
  assert(schedulerHeaders['Content-Type'] === 'application/json', 'Scheduler POST must send JSON Content-Type.')
  assert(schedulerHeaders.Accept === 'application/json', 'Scheduler POST must request JSON response.')

  const payload = buildSchedulerPayload({
    caption: 'RB Women controlled scheduler boundary test.',
    hashtags: ['#RBWomen', '#WomensSports'],
    mediaId: normalizedMediaId,
    scheduledAt: '2026-08-11T00:25:58.000Z',
    title: 'RB Women scheduler boundary',
  })

  assertMetricoolSchedulerContract(payload)
  assert(payload.text === 'RB Women controlled scheduler boundary test.\n#RBWomen #WomensSports', 'Payload text is missing caption/hashtags.')
  const providers = payload.providers as Array<Record<string, unknown>>
  assert(Array.isArray(providers) && providers.length === 1, 'Expected exactly one provider.')
  assert(providers[0]?.network === 'tiktok', 'Expected TikTok provider.')
  const publicationDate = readObject(payload.publicationDate)
  assert(publicationDate.dateTime === '2026-08-10T17:25:58', `Unexpected timezone dateTime ${String(publicationDate.dateTime)}.`)
  assert(publicationDate.timezone === 'America/Los_Angeles', 'Expected America/Los_Angeles timezone.')
  const media = readObject(payload.media)
  assert(media.mediaId === normalizedMediaId, 'Normalized mediaId was not preserved.')

  assert(
    formatMetricoolDateTimeForTimezone(new Date('2026-08-11T00:25:58.000Z'), 'America/Los_Angeles') === '2026-08-10T17:25:58',
    'Timezone conversion does not preserve requested instant as target wall-clock time.',
  )

  const endpoint = buildMetricoolSchedulerEndpointPreview({
    apiUrl: 'https://app.metricool.com/api',
    blogId: '5837036',
    userId: '4516763',
  })
  const endpointUrl = new URL(endpoint)
  assert(endpointUrl.pathname === '/api/v2/scheduler/posts', 'Unexpected scheduler endpoint path.')
  assert(endpointUrl.searchParams.get('blogId') === '5837036', 'Missing blogId query param.')
  assert(endpointUrl.searchParams.get('userId') === '4516763', 'Missing userId query param.')
  assert(!endpointUrl.searchParams.has('integrationSource'), 'Scheduler endpoint must not include integrationSource.')

  let localFailure = ''
  try {
    assertMetricoolSchedulerContract({
      ...payload,
      text: '',
      providers: [],
      publicationDate: {},
      media: {},
    })
  } catch (error) {
    localFailure = error instanceof Error ? error.message : String(error)
  }
  assert(localFailure.includes('text'), 'Contract assertion did not require text.')
  assert(localFailure.includes('providers'), 'Contract assertion did not require providers.')
  assert(localFailure.includes('publicationDate.dateTime'), 'Contract assertion did not require publicationDate.dateTime.')
  assert(localFailure.includes('publicationDate.timezone'), 'Contract assertion did not require publicationDate.timezone.')
  assert(localFailure.includes('media.mediaId'), 'Contract assertion did not require media.mediaId.')

  const validationBody = {
    error: 'ValidationError',
    details: [
      { field: 'text', message: 'must not be null' },
      { field: 'providers', message: 'must not be empty' },
      { field: 'publicationDate', message: 'must not be null' },
    ],
    token: 'secret-token-never-log',
  }
  const schedulerError = metricoolSchedulerError(400, validationBody)
  assert(schedulerError.includes('HTTP 400'), 'Scheduler error did not preserve HTTP status.')
  assert(schedulerError.includes('must not be null'), 'Scheduler error did not preserve validation detail.')
  assert(!schedulerError.includes('secret-token-never-log'), 'Scheduler error exposed a token value.')

  const sanitized = sanitizeMetricoolDiagnostic(validationBody) as Record<string, unknown>
  assert(sanitized.token === '[redacted]', 'Diagnostic sanitizer did not redact token-like keys.')
  assert(!JSON.stringify(payload).includes('secret-token-never-log'), 'Payload unexpectedly contains token material.')

  const resetScript = readFileSync('scripts/reset-metricool-failed-clip.ts', 'utf8')
  assert(resetScript.includes('assertNoMetricoolDuplicate'), 'Reset script no longer checks for duplicate scheduled posts.')
  assert(resetScript.includes(".eq('publish_status', 'metricool_failed')"), 'Reset script no longer guards the source failure state.')
  assert(!resetScript.includes("url.searchParams.set('integrationSource'"), 'Reset duplicate check must not include integrationSource.')

  console.log(JSON.stringify({
    result: 'PASS',
    schedulerEndpoint: {
      path: endpointUrl.pathname,
      queryParamNames: [...endpointUrl.searchParams.keys()],
      integrationSourcePresent: endpointUrl.searchParams.has('integrationSource'),
    },
    publicationDate: payload.publicationDate,
    providerNetworks: providers.map((provider) => provider.network),
    mediaIdPreserved: media.mediaId === normalizedMediaId,
    normalizeHeaderNames: Object.keys(normalizeHeaders),
    schedulerHeaderNames: Object.keys(schedulerHeaders),
    validationDetailsPreserved: schedulerError.includes('must not be null'),
    tokenDiagnosticRedacted: sanitized.token === '[redacted]',
    duplicatePreventionGuard: true,
  }, null, 2))
}

main()
