import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const channelProfileNames = {
  rb_sports: 'tiktok-rb-sports',
  rb_arena: 'tiktok-rb-arena',
  rb_women: 'tiktok-rb-women',
  rb_combat: 'tiktok-rb-combat',
  rb_futbol: 'tiktok-rb-futbol',
  rb_cfb: 'tiktok-rb-cfb',
} as const

type ChannelKey = keyof typeof channelProfileNames

type ProfileResult = {
  result?: string
  channelKey?: string
  profileRoot?: string
  profileDir?: string
  profileOverride?: boolean
  browser?: string
  browserMode?: string
  cdpEndpoint?: string | null
  safety?: Record<string, unknown>
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

async function resolveProfile(args: string[], env: Record<string, string | undefined> = {}) {
  const result = await execFileAsync(
    './node_modules/.bin/tsx',
    ['scripts/tiktok-web-upload-dry-run.ts', '--print-profile', ...args],
    {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      maxBuffer: 1024 * 1024,
    },
  )
  return JSON.parse(result.stdout) as ProfileResult
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

async function writeDraftFixture(channelKey: ChannelKey) {
  const fixtureDir = path.join(process.cwd(), 'tmp', 'tiktok-profile-smoke')
  await mkdir(fixtureDir, { recursive: true })
  const draftPath = path.join(fixtureDir, `${channelKey}.json`)
  await writeFile(draftPath, `${JSON.stringify({
    targetPlatform: 'tiktok',
    publishAction: 'dry_run',
    testMode: true,
    channelKey,
    tiktokDraft: { channelKey },
    mediaPath: '/tmp/not-used-by-print-profile.mp4',
  }, null, 2)}\n`)
  return draftPath
}

async function main() {
  const profiles: Record<string, string> = {}
  const defaultRoot = path.resolve(os.homedir(), 'rbhq-browser-profiles')
  const channelArgIndex = process.argv.indexOf('--channel')
  const onlyChannel = channelArgIndex >= 0 ? process.argv[channelArgIndex + 1] : null
  const expectedEntries = onlyChannel && !onlyChannel.startsWith('--')
    ? Object.entries(channelProfileNames).filter(([channelKey]) => channelKey === onlyChannel)
    : Object.entries(channelProfileNames)

  assert(expectedEntries.length > 0, `Unsupported smoke channel: ${String(onlyChannel)}.`)

  for (const [channelKey, profileName] of expectedEntries) {
    const result = await resolveProfile(['--channel', channelKey])
    const expectedProfileDir = path.join(defaultRoot, profileName)
    assert(result.result === 'PASS', `${channelKey} profile resolution did not pass.`)
    assert(result.channelKey === channelKey, `${channelKey} resolved to ${String(result.channelKey)}.`)
    assert(result.profileRoot === defaultRoot, `${channelKey} profile root mismatch: ${String(result.profileRoot)}.`)
    assert(result.profileDir === expectedProfileDir, `${channelKey} profile dir mismatch: ${String(result.profileDir)}.`)
    assert(result.profileOverride === false, `${channelKey} should not be using a profile override.`)
    assert(result.browser === 'chrome', `${channelKey} default browser mismatch: ${String(result.browser)}.`)
    assert(result.browserMode === 'headed', `${channelKey} default browser mode mismatch: ${String(result.browserMode)}.`)
    assert(result.safety?.clicksFinalPost === false, `${channelKey} profile resolution must not allow final Post clicks.`)
    profiles[channelKey] = result.profileDir
  }

  assert(new Set(Object.values(profiles)).size === Object.values(profiles).length, 'Channel profile dirs must be distinct.')

  const sportsDefault = await resolveProfile(['--channel', 'rb_sports'])
  const sportsSessionCheckShape = await resolveProfile(['--channel', 'rb_sports'])
  const sportsLoginShape = await resolveProfile(['--channel', 'rb_sports', '--browser', 'chrome'])
  const sportsDraftPath = await writeDraftFixture('rb_sports')
  const sportsDraftShape = await resolveProfile(['--draft', sportsDraftPath])
  assert(sportsDefault.profileDir === sportsSessionCheckShape.profileDir, 'session-check profile path shape diverged from default channel profile.')
  assert(sportsDefault.profileDir === sportsLoginShape.profileDir, 'login profile path shape diverged from default channel profile.')
  assert(sportsDefault.profileDir === sportsDraftShape.profileDir, 'dry-run draft profile path shape diverged from channel profile.')

  const cdpResult = await resolveProfile(['--channel', 'rb_sports', '--browser', 'cdp'])
  assert(cdpResult.result === 'PASS', 'rb_sports CDP profile resolution did not pass.')
  assert(cdpResult.channelKey === 'rb_sports', `rb_sports CDP resolved to ${String(cdpResult.channelKey)}.`)
  assert(cdpResult.browser === 'cdp', `rb_sports CDP browser mismatch: ${String(cdpResult.browser)}.`)
  assert(cdpResult.profileDir === path.join(defaultRoot, 'tiktok-rb-sports-manual-chrome'), 'rb_sports CDP profile dir mismatch.')
  assert(cdpResult.cdpEndpoint === 'http://127.0.0.1:9333', `rb_sports CDP endpoint mismatch: ${String(cdpResult.cdpEndpoint)}.`)

  const overrideRoot = path.join(process.cwd(), 'tmp', 'stable-profile-root-smoke')
  const overrideResult = await resolveProfile(['--channel', 'rb_women'], { TIKTOK_BROWSER_PROFILE_ROOT: overrideRoot })
  assert(overrideResult.profileRoot === path.resolve(overrideRoot), 'TIKTOK_BROWSER_PROFILE_ROOT was not honored.')
  assert(overrideResult.profileDir === path.join(path.resolve(overrideRoot), 'tiktok-rb-women'), 'override root channel path mismatch.')

  const explicitProfile = path.join(process.cwd(), 'tmp', 'explicit-profile-smoke')
  const explicitResult = await resolveProfile(['--channel', 'rb_sports', '--profile-dir', explicitProfile])
  assert(explicitResult.profileRoot === defaultRoot, 'explicit profile should not change the configured profile root.')
  assert(explicitResult.profileDir === path.resolve(explicitProfile), '--profile-dir override was not honored.')
  assert(explicitResult.profileOverride === true, '--profile-dir should report profileOverride=true.')

  if (!onlyChannel) {
    await expectMissingChannelFailure()
  }

  console.log(JSON.stringify(
    {
      result: 'PASS',
      defaultRoot,
      profiles,
      cdpProfiles: {
        rb_sports: cdpResult.profileDir,
      },
      samePathAcrossModes: {
        rb_sports: sportsDefault.profileDir,
      },
      overrideRoot: overrideResult.profileRoot,
      explicitProfile: explicitResult.profileDir,
      missingChannelFailure: onlyChannel ? 'skipped' : 'TIKTOK_CHANNEL_REQUIRED',
      safety: {
        opensTikTok: false,
        requiresTikTokLogin: false,
        uploadsVideo: false,
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
