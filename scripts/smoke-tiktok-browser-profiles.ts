import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const expectedProfiles = {
  rb_sports: 'tmp/browser-profiles/tiktok-rb-sports',
  rb_arena: 'tmp/browser-profiles/tiktok-rb-arena',
  rb_women: 'tmp/browser-profiles/tiktok-rb-women',
  rb_combat: 'tmp/browser-profiles/tiktok-rb-combat',
  rb_futbol: 'tmp/browser-profiles/tiktok-rb-futbol',
  rb_cfb: 'tmp/browser-profiles/tiktok-rb-cfb',
} as const

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

async function resolveProfile(channelKey: string) {
  const result = await execFileAsync(
    './node_modules/.bin/tsx',
    ['scripts/tiktok-web-upload-dry-run.ts', '--print-profile', '--channel', channelKey],
    { cwd: process.cwd(), maxBuffer: 1024 * 1024 },
  )
  return JSON.parse(result.stdout) as {
    result?: string
    channelKey?: string
    profileDir?: string
    supportedChannelKeys?: string[]
  }
}

async function resolveCdpProfile(channelKey: string) {
  const result = await execFileAsync(
    './node_modules/.bin/tsx',
    ['scripts/tiktok-web-upload-dry-run.ts', '--print-profile', '--channel', channelKey, '--browser', 'cdp'],
    { cwd: process.cwd(), maxBuffer: 1024 * 1024 },
  )
  return JSON.parse(result.stdout) as {
    result?: string
    channelKey?: string
    profileDir?: string
    browser?: string
    cdpEndpoint?: string | null
  }
}

async function expectMissingChannelFailure() {
  try {
    await execFileAsync(
      './node_modules/.bin/tsx',
      ['scripts/tiktok-web-upload-dry-run.ts', '--print-profile'],
      { cwd: process.cwd(), maxBuffer: 1024 * 1024 },
    )
  } catch (error) {
    const execError = error as { stderr?: string; stdout?: string }
    const output = `${execError.stdout ?? ''}\n${execError.stderr ?? ''}`
    assert(output.includes('TIKTOK_CHANNEL_REQUIRED'), 'Missing channel did not fail with TIKTOK_CHANNEL_REQUIRED.')
    return
  }

  throw new Error('Missing channel unexpectedly passed.')
}

async function main() {
  const profiles: Record<string, string> = {}
  const cdpProfiles: Record<string, string> = {}
  const channelArgIndex = process.argv.indexOf('--channel')
  const onlyChannel = channelArgIndex >= 0 ? process.argv[channelArgIndex + 1] : null
  const expectedEntries = onlyChannel && !onlyChannel.startsWith('--')
    ? Object.entries(expectedProfiles).filter(([channelKey]) => channelKey === onlyChannel)
    : Object.entries(expectedProfiles)

  assert(expectedEntries.length > 0, `Unsupported smoke channel: ${String(onlyChannel)}.`)

  for (const [channelKey, relativeProfileDir] of expectedEntries) {
    const result = await resolveProfile(channelKey)
    const expectedProfileDir = path.resolve(relativeProfileDir)
    assert(result.result === 'PASS', `${channelKey} profile resolution did not pass.`)
    assert(result.channelKey === channelKey, `${channelKey} resolved to ${String(result.channelKey)}.`)
    assert(result.profileDir === expectedProfileDir, `${channelKey} profile dir mismatch: ${String(result.profileDir)}.`)
    profiles[channelKey] = result.profileDir
  }

  const cdpResult = await resolveCdpProfile('rb_sports')
  assert(cdpResult.result === 'PASS', 'rb_sports CDP profile resolution did not pass.')
  assert(cdpResult.channelKey === 'rb_sports', `rb_sports CDP resolved to ${String(cdpResult.channelKey)}.`)
  assert(cdpResult.browser === 'cdp', `rb_sports CDP browser mismatch: ${String(cdpResult.browser)}.`)
  assert(cdpResult.profileDir === path.resolve('tmp/browser-profiles/tiktok-rb-sports-manual-chrome'), 'rb_sports CDP profile dir mismatch.')
  assert(cdpResult.cdpEndpoint === 'http://127.0.0.1:9333', `rb_sports CDP endpoint mismatch: ${String(cdpResult.cdpEndpoint)}.`)
  cdpProfiles.rb_sports = cdpResult.profileDir

  if (!onlyChannel) {
    await expectMissingChannelFailure()
  }

  console.log(JSON.stringify(
    {
      result: 'PASS',
      profiles,
      cdpProfiles,
      missingChannelFailure: onlyChannel ? 'skipped' : 'TIKTOK_CHANNEL_REQUIRED',
      safety: {
        opensTikTok: false,
        requiresTikTokLogin: false,
        usesTikTokApi: false,
        storesTikTokCredentialsInRbhq: false,
        marksRbhqPublished: false,
        clicksFinalPost: false,
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
