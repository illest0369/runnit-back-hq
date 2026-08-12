import {
  buildYtDlpArgs,
  classifyYouTubeAcquisitionFailure,
} from '../lib/rb-women-opus-pipeline'
import {
  MAX_AUTOPILOT_NEXT_SOURCE_ATTEMPTS,
  boundedAutopilotNextSourceAttempts,
} from '../lib/rb-women-autopilot-next'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function testNormalDownloadCommand() {
  const args = buildYtDlpArgs(['--no-playlist', 'https://www.youtube.com/watch?v=ok'])
  assert(!args.includes('--cookies-from-browser'), 'Normal yt-dlp attempt should not include browser cookies.')
  assert(args.includes('--no-playlist'), 'Normal yt-dlp args lost base options.')
}

function testAuthRequiredClassification() {
  const status = classifyYouTubeAcquisitionFailure('Sign in to confirm you’re not a bot. Use --cookies-from-browser.')
  assert(status === 'auth_required', `Expected auth_required, got ${status}.`)
  const prefixedStatus = classifyYouTubeAcquisitionFailure('Video unavailable. Sign in to confirm you’re not a bot.')
  assert(prefixedStatus === 'auth_required', `Expected bot-gated unavailable response to be auth_required, got ${prefixedStatus}.`)
}

function testAuthenticatedFallbackCommand() {
  const args = buildYtDlpArgs(['--dump-single-json', 'https://www.youtube.com/watch?v=auth'], {
    cookiesFromBrowser: 'safari',
  })
  assert(args[0] === '--cookies-from-browser', 'Authenticated fallback should prepend --cookies-from-browser.')
  assert(args[1] === 'safari', 'Authenticated fallback should use configured browser name.')
  assert(!args.join(' ').includes('Cookie:'), 'Authenticated fallback must not inline cookie values.')
}

function testFallbackToNextRankedSourceAndBoundedRetries() {
  const ranked = ['rank-1-auth-required', 'rank-2-success', 'rank-3-success', 'rank-4-not-attempted']
  const attempts = boundedAutopilotNextSourceAttempts(ranked)
  assert(attempts.length === MAX_AUTOPILOT_NEXT_SOURCE_ATTEMPTS, 'Autopilot-next attempts must be bounded.')
  assert(attempts[0] === 'rank-1-auth-required' && attempts[1] === 'rank-2-success', 'Ranked source order was not preserved.')
  assert(!attempts.includes('rank-4-not-attempted'), 'Autopilot-next exceeded bounded retry limit.')
}

function testCookieSecretsNeverLogged() {
  const args = buildYtDlpArgs(['https://www.youtube.com/watch?v=auth'], { cookiesFromBrowser: 'safari' })
  const serialized = JSON.stringify(args)
  assert(!/SID=|HSID=|SSID=|APISID=|SAPISID=|LOGIN_INFO=/.test(serialized), 'Cookie secret value appeared in yt-dlp args.')
}

function main() {
  testNormalDownloadCommand()
  testAuthRequiredClassification()
  testAuthenticatedFallbackCommand()
  testFallbackToNextRankedSourceAndBoundedRetries()
  testCookieSecretsNeverLogged()

  console.log(JSON.stringify({
    result: 'PASS',
    cases: [
      'normal_download_command',
      'auth_required_classification',
      'authenticated_fallback_command',
      'fallback_to_next_ranked_source_bounded',
      'cookie_secrets_never_logged',
    ],
    safety: {
      downloadsVideo: false,
      extractsCookies: false,
      uploadsToR2: false,
      callsMetricool: false,
    },
  }, null, 2))
}

try {
  main()
} catch (error) {
  console.error(JSON.stringify({
    result: 'FAIL',
    error: error instanceof Error ? error.message : String(error),
  }, null, 2))
  process.exitCode = 1
}
