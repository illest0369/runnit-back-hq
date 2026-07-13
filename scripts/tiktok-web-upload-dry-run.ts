import { execFile } from 'node:child_process'
import { mkdir, readFile, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { chromium, webkit, type Browser, type BrowserContext, type Page } from 'playwright'

type DraftPackage = Record<string, unknown>
type ChannelKey = 'rb_sports' | 'rb_arena' | 'rb_women' | 'rb_combat' | 'rb_futbol' | 'rb_cfb'
type RunMode = 'dry-run' | 'live-post' | 'login' | 'session-check' | 'print-profile'
type BrowserChoice = 'chrome' | 'chromium' | 'webkit' | 'cdp'

type CliOptions = {
  draftPath: string | null
  channelArg: string | null
  mode: RunMode
  stageUpload: boolean
  headless: boolean
  headed: boolean
  keepOpen: boolean
  chromeOnly: boolean
  browser: BrowserChoice
  loginFriendly: boolean
  timeoutMs: number
  slowMo: number
  profileDirOverride: string | null
  uploadUrl: string
  artifactDir: string
  cdpEndpoint: string
  cdpPort: number
  launchCdpChrome: boolean
  allowFinalPost: boolean
}

const DEFAULT_UPLOAD_URL = 'https://www.tiktok.com/upload?lang=en'
const SESSION_COOKIE_PATTERN = /^(sessionid|sessionid_ss|sid_tt|sid_guard|uid_tt|uid_tt_ss)$/i
const DEFAULT_CDP_PORT = 9333
const DEFAULT_PROFILE_ROOT = path.join(os.homedir(), 'rbhq-browser-profiles')
const CHANNEL_PROFILE_DIRS: Record<ChannelKey, string> = {
  rb_sports: 'tiktok-rb-sports',
  rb_arena: 'tiktok-rb-arena',
  rb_women: 'tiktok-rb-women',
  rb_combat: 'tiktok-rb-combat',
  rb_futbol: 'tiktok-rb-futbol',
  rb_cfb: 'tiktok-rb-cfb',
}
const SUPPORTED_CHANNEL_KEYS = Object.keys(CHANNEL_PROFILE_DIRS) as ChannelKey[]

function readFlagValue(name: string): string | null {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : null
  return value && !value.startsWith('--') ? value : null
}

function hasFlag(name: string) {
  return process.argv.includes(name)
}

function readNumberFlag(name: string, fallback: number) {
  const value = readFlagValue(name)
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`)
  }
  return parsed
}

function readBrowserChoice(chromeOnly: boolean): BrowserChoice {
  if (hasFlag('--launch-cdp-chrome') || hasFlag('--connect-cdp') || hasFlag('--cdp-endpoint')) return 'cdp'
  if (hasFlag('--webkit')) return 'webkit'
  if (chromeOnly) return 'chrome'

  const value = readFlagValue('--browser')
  if (!value) return 'chrome'

  const normalized = value.trim().toLowerCase()
  if (normalized === 'chrome' || normalized === 'chromium' || normalized === 'webkit' || normalized === 'cdp') {
    return normalized
  }

  throw new Error('--browser must be one of: chrome, chromium, webkit, cdp.')
}

function readOptions(): CliOptions {
  const draftPath = readFlagValue('--draft')
  const mode: RunMode = hasFlag('--login')
    ? 'login'
    : hasFlag('--live-post')
      ? 'live-post'
      : hasFlag('--session-check')
        ? 'session-check'
        : hasFlag('--print-profile')
          ? 'print-profile'
          : 'dry-run'
  const headed = hasFlag('--headed')
  const defaultHeadless = mode === 'session-check'
  const chromeOnly = hasFlag('--chrome-only')
  const browser = readBrowserChoice(chromeOnly)
  const cdpPort = readNumberFlag('--cdp-port', DEFAULT_CDP_PORT)
  return {
    draftPath,
    channelArg: readFlagValue('--channel'),
    mode,
    stageUpload: hasFlag('--stage-upload'),
    headless: headed ? false : hasFlag('--headless') || defaultHeadless,
    headed,
    keepOpen: hasFlag('--keep-open') || mode === 'login',
    chromeOnly,
    browser,
    loginFriendly: hasFlag('--login-friendly'),
    timeoutMs: readNumberFlag('--timeout-ms', 45_000),
    slowMo: readNumberFlag('--slow-mo', 0),
    profileDirOverride: readFlagValue('--profile-dir') || process.env.TIKTOK_PLAYWRIGHT_PROFILE || null,
    uploadUrl: readFlagValue('--upload-url') || DEFAULT_UPLOAD_URL,
    artifactDir: path.resolve(readFlagValue('--artifact-dir') || path.join(process.cwd(), 'tmp', 'tiktok-web-upload-artifacts')),
    cdpEndpoint: readFlagValue('--cdp-endpoint') || readFlagValue('--connect-cdp') || `http://127.0.0.1:${cdpPort}`,
    cdpPort,
    launchCdpChrome: hasFlag('--launch-cdp-chrome'),
    allowFinalPost: hasFlag('--allow-final-post'),
  }
}

const LOGIN_FRIENDLY_IGNORE_DEFAULT_ARGS = [
  '--disable-background-networking',
  '--disable-client-side-phishing-detection',
  '--disable-component-extensions-with-background-pages',
  '--disable-component-update',
  '--disable-default-apps',
  '--disable-extensions',
  '--disable-sync',
  '--no-first-run',
  '--no-service-autorun',
  '--password-store=basic',
  '--use-mock-keychain',
]

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function objectValue(value: unknown): DraftPackage {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as DraftPackage : {}
}

function normalizeChannelKey(value: string): ChannelKey | null {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const aliases: Record<string, ChannelKey> = {
    rb_sports: 'rb_sports',
    sports: 'rb_sports',
    tiktok_rb_sports: 'rb_sports',
    rb_arena: 'rb_arena',
    arena: 'rb_arena',
    tiktok_rb_arena: 'rb_arena',
    rb_women: 'rb_women',
    women: 'rb_women',
    rb_womens: 'rb_women',
    tiktok_rb_women: 'rb_women',
    rb_combat: 'rb_combat',
    combat: 'rb_combat',
    tiktok_rb_combat: 'rb_combat',
    rb_futbol: 'rb_futbol',
    futbol: 'rb_futbol',
    soccer: 'rb_futbol',
    rb_liga: 'rb_futbol',
    liga: 'rb_futbol',
    runnitbackliga: 'rb_futbol',
    tiktok_rb_futbol: 'rb_futbol',
    rb_cfb: 'rb_cfb',
    cfb: 'rb_cfb',
    tiktok_rb_cfb: 'rb_cfb',
  }
  return aliases[normalized] ?? null
}

function readNestedString(source: DraftPackage, pathKeys: string[]): string | null {
  let current: unknown = source
  for (const key of pathKeys) {
    const object = objectValue(current)
    current = object[key]
  }
  return stringValue(current)
}

function inferChannelFromDraft(draft: DraftPackage): ChannelKey | null {
  const candidates = [
    readDraftText(draft, 'channel'),
    readDraftText(draft, 'channelKey'),
    readDraftText(draft, 'channel_key'),
    readDraftText(draft, 'targetChannel'),
    readDraftText(draft, 'target_channel'),
    readDraftText(draft, 'targetAccount'),
    readDraftText(draft, 'target_account'),
    readDraftText(draft, 'accountKey'),
    readDraftText(draft, 'account_key'),
    readNestedString(draft, ['target', 'channel']),
    readNestedString(draft, ['target', 'channelKey']),
    readNestedString(draft, ['target', 'accountKey']),
    readNestedString(draft, ['tiktok', 'channel']),
    readNestedString(draft, ['tiktok', 'channelKey']),
    readNestedString(draft, ['tiktokDraft', 'channel']),
    readNestedString(draft, ['tiktokDraft', 'channelKey']),
  ].filter((value): value is string => Boolean(value))

  for (const candidate of candidates) {
    const channelKey = normalizeChannelKey(candidate)
    if (channelKey) return channelKey
  }

  return null
}

function resolveChannel(input: { channelArg: string | null; draft: DraftPackage | null }) {
  if (input.channelArg) {
    const channelKey = normalizeChannelKey(input.channelArg)
    if (!channelKey) {
      throw new Error(`TIKTOK_CHANNEL_UNSUPPORTED: ${input.channelArg}. Supported channel keys: ${SUPPORTED_CHANNEL_KEYS.join(', ')}`)
    }
    return channelKey
  }

  const inferred = input.draft ? inferChannelFromDraft(input.draft) : null
  if (inferred) return inferred

  throw new Error(`TIKTOK_CHANNEL_REQUIRED: pass --channel <channel_key>. Supported channel keys: ${SUPPORTED_CHANNEL_KEYS.join(', ')}`)
}

function assertDraftChannelMatches(channelKey: ChannelKey, draft: DraftPackage | null) {
  if (!draft) return
  const inferred = inferChannelFromDraft(draft)
  if (inferred && inferred !== channelKey) {
    throw new Error(`TIKTOK_CHANNEL_MISMATCH: draft channel ${inferred} does not match browser channel ${channelKey}.`)
  }
}

function resolveProfileRoot() {
  return path.resolve(process.env.TIKTOK_BROWSER_PROFILE_ROOT?.trim() || DEFAULT_PROFILE_ROOT)
}

function resolveProfilePaths(channelKey: ChannelKey, override: string | null, browser: BrowserChoice) {
  const profileRoot = resolveProfileRoot()
  if (override) {
    return {
      profileRoot,
      profileDir: path.resolve(override),
      profileOverride: true,
    }
  }

  const baseProfileDir = path.join(profileRoot, CHANNEL_PROFILE_DIRS[channelKey])
  return {
    profileRoot,
    profileDir: browser === 'webkit'
      ? path.resolve(`${baseProfileDir}-webkit`)
      : browser === 'cdp'
        ? path.resolve(`${baseProfileDir}-manual-chrome`)
        : path.resolve(baseProfileDir),
    profileOverride: false,
  }
}

async function readDraft(draftPath: string) {
  const absoluteDraftPath = path.resolve(draftPath)
  const raw = await readFile(absoluteDraftPath, 'utf8')
  const draft = JSON.parse(raw) as DraftPackage
  return { draft, absoluteDraftPath }
}

function mapContainerPathToHost(value: string) {
  const mappings = [
    ['/home/node/.n8n-files/rbhq-tmp', path.join(process.cwd(), 'tmp')],
    ['/rbhq-tmp', path.join(process.cwd(), 'tmp')],
  ] as const

  for (const [containerPrefix, hostPrefix] of mappings) {
    if (value.startsWith(containerPrefix)) {
      return path.join(hostPrefix, value.slice(containerPrefix.length))
    }
  }

  return value
}

function resolveMediaPath(draft: DraftPackage) {
  const tiktokDraft = objectValue(draft.tiktokDraft)
  const media = objectValue(draft.media)
  const candidates = [
    stringValue(draft.mediaPath),
    stringValue(tiktokDraft.mediaPath),
    stringValue(media.localPath),
    stringValue(media.path),
    stringValue(draft.containerMediaPath),
    stringValue(tiktokDraft.containerMediaPath),
  ].filter((value): value is string => Boolean(value))

  const first = candidates[0]
  if (!first) {
    throw new Error('Draft JSON does not include mediaPath, tiktokDraft.mediaPath, or media.localPath.')
  }

  return path.resolve(mapContainerPathToHost(first))
}

async function verifyMp4(mediaPath: string) {
  const mediaStat = await stat(mediaPath).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Rendered MP4 not accessible at ${mediaPath}: ${message}`)
  })

  if (!mediaStat.isFile()) {
    throw new Error(`Rendered MP4 path is not a file: ${mediaPath}`)
  }
  if (!mediaPath.toLowerCase().endsWith('.mp4')) {
    throw new Error(`Rendered media is not an MP4: ${mediaPath}`)
  }

  return mediaStat.size
}

function readDraftText(draft: DraftPackage, key: string) {
  const tiktokDraft = objectValue(draft.tiktokDraft)
  return stringValue(draft[key]) || stringValue(tiktokDraft[key])
}

function buildCaption(draft: DraftPackage) {
  const caption = readDraftText(draft, 'caption') || readDraftText(draft, 'recommended_caption') || ''
  const tiktokDraft = objectValue(draft.tiktokDraft)
  const hashtags = [...stringArray(draft.hashtags), ...stringArray(tiktokDraft.hashtags)]
  const uniqueTags = Array.from(new Set(hashtags.map((tag) => tag.startsWith('#') ? tag : `#${tag}`)))
  const missingTags = uniqueTags.filter((tag) => !caption.toLowerCase().includes(tag.toLowerCase()))
  return [caption.trim(), missingTags.join(' ')].filter(Boolean).join('\n')
}

const execFileAsync = promisify(execFile)

async function waitForCdpEndpoint(endpoint: string, timeoutMs: number) {
  const startedAt = Date.now()
  const versionUrl = new URL('/json/version', endpoint).toString()

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(versionUrl)
      if (response.ok) return
    } catch {
      // Chrome may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(`CDP endpoint was not reachable at ${endpoint}. Is Chrome open with --remote-debugging-port?`)
}

async function launchManualChromeForCdp(options: CliOptions, profileDir: string) {
  if (process.platform !== 'darwin') {
    throw new Error('--launch-cdp-chrome is currently implemented for macOS only. Start Chrome manually with --remote-debugging-port and pass --cdp-endpoint instead.')
  }

  await execFileAsync('open', [
    '-na',
    'Google Chrome',
    '--args',
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${options.cdpPort}`,
    '--no-first-run',
    options.uploadUrl,
  ])
}

async function launchLocalBrowser(options: CliOptions, profileDir: string): Promise<{
  context: BrowserContext
  close: () => Promise<void>
  connection: BrowserChoice
}> {
  await mkdir(profileDir, { recursive: true })
  if (options.loginFriendly && options.mode === 'dry-run') {
    throw new Error('--login-friendly is only supported for --login, --session-check, or --print-profile validation.')
  }
  if (options.loginFriendly && options.browser !== 'chrome' && options.browser !== 'chromium') {
    throw new Error('--login-friendly only applies to Chrome/Chromium launches.')
  }

  if (options.browser === 'cdp') {
    if (options.launchCdpChrome) {
      await launchManualChromeForCdp(options, profileDir)
    }
    await waitForCdpEndpoint(options.cdpEndpoint, options.timeoutMs)
    const browser: Browser = await chromium.connectOverCDP(options.cdpEndpoint, {
      noDefaults: true,
      timeout: options.timeoutMs,
      slowMo: options.slowMo,
    })
    const context = browser.contexts()[0] || await browser.newContext({ acceptDownloads: false })
    return {
      context,
      close: () => browser.close(),
      connection: 'cdp',
    }
  }

  if (options.browser === 'webkit') {
    const context = await webkit.launchPersistentContext(profileDir, {
      headless: options.headless,
      slowMo: options.slowMo,
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: false,
    })
    return {
      context,
      close: () => context.close(),
      connection: 'webkit',
    }
  }

  const launchOptions = {
    channel: options.browser === 'chrome' ? 'chrome' : undefined,
    headless: options.headless,
    slowMo: options.slowMo,
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: false,
    ignoreDefaultArgs: options.loginFriendly ? LOGIN_FRIENDLY_IGNORE_DEFAULT_ARGS : undefined,
  }

  try {
    const context = await chromium.launchPersistentContext(profileDir, launchOptions)
    return {
      context,
      close: () => context.close(),
      connection: options.browser,
    }
  } catch (error) {
    if (options.chromeOnly) throw error
    const context = await chromium.launchPersistentContext(profileDir, {
      headless: options.headless,
      slowMo: options.slowMo,
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: false,
      ignoreDefaultArgs: options.loginFriendly ? LOGIN_FRIENDLY_IGNORE_DEFAULT_ARGS : undefined,
    })
    return {
      context,
      close: () => context.close(),
      connection: 'chromium',
    }
  }
}

async function visibleText(page: Page) {
  return page.locator('body').innerText({ timeout: 5_000 }).catch(() => '')
}

async function firstVisible(page: Page, selector: string, timeout = 1500) {
  return page.locator(selector).first().isVisible({ timeout }).catch(() => false)
}

async function dismissUnsavedDraftPrompt(page: Page, timeout = 3_000) {
  const bodyText = await visibleText(page)
  if (!/video you were editing wasn.t saved|continue editing\?/i.test(bodyText)) return false

  const discardButton = page.getByRole('button', { name: /^discard$/i }).first()
  const visible = await discardButton.isVisible({ timeout }).catch(() => false)
  if (!visible) return false

  await discardButton.click({ timeout })
  await page.waitForTimeout(1_000)
  return true
}

async function classifyUploadPage(context: BrowserContext, page: Page) {
  const cookies = await context.cookies('https://www.tiktok.com')
  const sessionCookieNames = cookies
    .filter((cookie) => SESSION_COOKIE_PATTERN.test(cookie.name))
    .map((cookie) => cookie.name)
    .sort()
  const hasSessionCookies = sessionCookieNames.length > 0
  const bodyText = await visibleText(page)
  const fileInputCount = await page.locator('input[type="file"]').count().catch(() => 0)
  const uploadCopyVisible =
    /select video|upload video|drag and drop|choose file/i.test(bodyText) ||
    await firstVisible(page, '[data-e2e*="upload" i]')
  const loginCopyVisible =
    /log in to tiktok|sign up for tiktok|continue with facebook|continue with google|use phone \/ email/i.test(bodyText)
  const challengeVisible = /captcha|verify to continue|access denied|something went wrong/i.test(bodyText)
  const uploadPageReady = fileInputCount > 0 || uploadCopyVisible
  const loginRequired = !hasSessionCookies || loginCopyVisible || /\/login|\/signup/i.test(page.url())

  return {
    currentUrl: page.url(),
    hasSessionCookies,
    sessionCookieNames,
    fileInputCount,
    uploadCopyVisible,
    uploadPageReady,
    loginCopyVisible,
    challengeVisible,
    loginRequired,
    bodyTextSample: bodyText.replace(/\s+/g, ' ').slice(0, 280),
  }
}

async function stageUpload(page: Page, mediaPath: string, caption: string, timeoutMs: number) {
  const staleDraftPromptDiscarded = await dismissUnsavedDraftPrompt(page)
  const fileInput = page.locator('input[type="file"]').first()
  if (await fileInput.count() === 0) {
    throw new Error('TikTok upload page does not expose an input[type=file] control.')
  }

  await fileInput.setInputFiles(mediaPath, { timeout: timeoutMs })
  await page.waitForTimeout(5_000)

  let captionFilled = false
  if (caption) {
    const textarea = page.locator('textarea').first()
    const editor = page.locator('[contenteditable="true"]').first()

    if (await textarea.count()) {
      await textarea.fill(caption, { timeout: 10_000 })
      captionFilled = true
    } else if (await editor.count()) {
      await editor.waitFor({ state: 'visible', timeout: 10_000 })
      await editor.click({ timeout: 5_000 }).catch(async () => {
        await editor.evaluate((element) => {
          const target = element as HTMLElement
          target.focus()
          const selection = window.getSelection()
          const range = document.createRange()
          range.selectNodeContents(target)
          range.collapse(false)
          selection?.removeAllRanges()
          selection?.addRange(range)
        })
      })
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
      await page.keyboard.insertText(caption)
      captionFilled = true
    }
  }

  const captionPresent = captionFilled || await captionAlreadyPresent(page, caption)
  const postButton = await inspectPostButton(page)
  return { uploadStaged: true, captionFilled, captionPresent, postButtonVisible: postButton.visible, postButtonEnabled: postButton.enabled, staleDraftPromptDiscarded }
}

async function captionAlreadyPresent(page: Page, expectedCaption: string) {
  const expected = expectedCaption.replace(/\s+/g, ' ').trim()
  const textareaValue = await page.locator('textarea').first().inputValue({ timeout: 1_000 }).catch(() => '')
  const editorText = await page.locator('[contenteditable="true"]').first().innerText({ timeout: 1_000 }).catch(() => '')
  const actual = [textareaValue, editorText].join(' ').replace(/\s+/g, ' ').trim()
  if (!actual) return false
  if (!expected) return true
  const expectedLead = expected.slice(0, 80)
  return actual.includes(expectedLead) || expected.includes(actual.slice(0, 80))
}

async function inspectPostButton(page: Page) {
  const button = page.getByRole('button', { name: /post/i }).first()
  const visible = await button.isVisible({ timeout: 2_000 }).catch(() => false)
  const enabled = visible ? await button.isEnabled({ timeout: 2_000 }).catch(() => false) : false
  return { button, visible, enabled }
}

async function detectPostConfirmation(page: Page, timeoutMs: number) {
  await Promise.race([
    page.waitForURL((url) => !/\/upload/i.test(url.href), { timeout: Math.min(timeoutMs, 20_000) }).catch(() => undefined),
    page.waitForTimeout(4_000),
  ])
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined)

  const bodyText = (await visibleText(page)).replace(/\s+/g, ' ')
  const successTextVisible =
    /your video (has been )?(uploaded|posted|published)|video (has been )?(uploaded|posted|published)|post (has been )?(uploaded|published)|processing your video|view post|manage posts|upload another/i.test(bodyText)
  const navigatedToSuccessState = !/\/upload/i.test(page.url()) && /tiktok\.com/i.test(page.url())
  return {
    publishConfirmed: successTextVisible || navigatedToSuccessState,
    currentUrl: page.url(),
    bodyTextSample: bodyText.slice(0, 280),
  }
}

async function clickFinalPost(page: Page, timeoutMs: number) {
  const staleDraftPromptDiscarded = await dismissUnsavedDraftPrompt(page)
  const postButton = await inspectPostButton(page)
  if (!postButton.visible) {
    return {
      requested: true,
      clickedFinalPost: false,
      status: 'blocked',
      confirmation: 'not_clicked',
      blocker: 'TIKTOK_POST_BUTTON_NOT_VISIBLE',
      staleDraftPromptDiscarded,
    }
  }
  if (!postButton.enabled) {
    return {
      requested: true,
      clickedFinalPost: false,
      status: 'blocked',
      confirmation: 'not_clicked',
      blocker: 'TIKTOK_POST_BUTTON_DISABLED',
      staleDraftPromptDiscarded,
    }
  }

  await postButton.button.click({ timeout: timeoutMs })
  const confirmation = await detectPostConfirmation(page, timeoutMs)
  return {
    requested: true,
    clickedFinalPost: true,
    status: confirmation.publishConfirmed ? 'posted' : 'post_confirmation_needed',
    confirmation: confirmation.publishConfirmed ? 'confirmed' : 'ambiguous',
    blocker: confirmation.publishConfirmed ? null : 'TIKTOK_POST_CONFIRMATION_NEEDED',
    staleDraftPromptDiscarded,
    ...confirmation,
  }
}

async function screenshot(page: Page, artifactDir: string, name: string) {
  await mkdir(artifactDir, { recursive: true })
  const filePath = path.join(artifactDir, name)
  await page.screenshot({ path: filePath, fullPage: false })
  return filePath
}

function blockerFromState(state: Awaited<ReturnType<typeof classifyUploadPage>>) {
  if (state.challengeVisible) return 'TIKTOK_BROWSER_CHALLENGE_OR_ACCESS_BLOCK'
  if (state.loginRequired) return 'TIKTOK_LOGIN_REQUIRED'
  if (!state.uploadPageReady) return 'TIKTOK_UPLOAD_PAGE_NOT_READY'
  return null
}

async function main() {
  const options = readOptions()
  let draft: DraftPackage | null = null
  let absoluteDraftPath: string | null = null

  if (options.draftPath) {
    ;({ draft, absoluteDraftPath } = await readDraft(options.draftPath))
  } else if (options.mode === 'dry-run' || options.mode === 'live-post') {
    throw new Error('Missing --draft <draft_json_path>.')
  }

  const channelKey = resolveChannel({ channelArg: options.channelArg, draft })
  assertDraftChannelMatches(channelKey, draft)
  const profilePaths = resolveProfilePaths(channelKey, options.profileDirOverride, options.browser)
  const profileDir = profilePaths.profileDir

  if (options.allowFinalPost && options.mode !== 'live-post') {
    throw new Error('--allow-final-post is only accepted with --live-post.')
  }
  if (options.mode === 'live-post') {
    if (!options.allowFinalPost) {
      throw new Error('Live posting requires --allow-final-post.')
    }
    if (process.env.RBHQ_TIKTOK_LIVE_POSTING_ALLOWED !== 'true') {
      throw new Error('Live posting requires RBHQ_TIKTOK_LIVE_POSTING_ALLOWED=true.')
    }
    if (!options.stageUpload) {
      throw new Error('Live posting requires --stage-upload so the MP4 and caption are verified before clicking Post.')
    }
  }

  if (options.mode === 'print-profile') {
    console.log(JSON.stringify({
      result: 'PASS',
      channelKey,
      profileRoot: profilePaths.profileRoot,
      profileDir,
      profileOverride: profilePaths.profileOverride,
      browser: options.browser,
      browserMode: options.headless ? 'headless' : 'headed',
      cdpEndpoint: options.browser === 'cdp' ? options.cdpEndpoint : null,
      supportedChannelKeys: SUPPORTED_CHANNEL_KEYS,
      safety: {
        usesTikTokApi: false,
        storesTikTokCredentialsInRbhq: false,
        marksRbhqPublished: false,
        clicksFinalPost: false,
      },
    }, null, 2))
    return
  }

  if (draft?.targetPlatform && draft.targetPlatform !== 'tiktok') {
    throw new Error(`Draft targetPlatform must be tiktok; received ${String(draft.targetPlatform)}.`)
  }
  if (draft?.testMode !== undefined && draft.testMode !== true) {
    throw new Error('Draft must remain testMode=true for this dry run.')
  }
  if (draft?.publishAction !== undefined && draft.publishAction !== 'dry_run') {
    throw new Error('Draft must remain publishAction=dry_run for this dry run.')
  }

  const mediaPath = draft ? resolveMediaPath(draft) : null
  const mediaSizeBytes = mediaPath ? await verifyMp4(mediaPath) : null
  const caption = draft ? buildCaption(draft) : ''
  const clipId = draft && mediaPath
    ? readDraftText(draft, 'clipId') || readDraftText(draft, 'clip_id') || path.basename(mediaPath, '.mp4')
    : channelKey

  const browserSession = await launchLocalBrowser(options, profileDir)
  const context = browserSession.context
  const page = context.pages()[0] || await context.newPage()
  page.setDefaultTimeout(options.timeoutMs)

  let result: Record<string, unknown>
  try {
    await page.goto(options.uploadUrl, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs })
    await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined)

    const readiness = await classifyUploadPage(context, page)
    const blocker = blockerFromState(readiness)
    const screenshotPath = await screenshot(page, options.artifactDir, `${clipId}-upload-page.png`)
    const loggedIn = !readiness.loginRequired

    const staging =
      options.stageUpload && !blocker && mediaPath
        ? await stageUpload(page, mediaPath, caption, options.timeoutMs)
        : {
            uploadStaged: false,
            captionFilled: false,
            captionPresent: false,
            postButtonVisible: false,
            postButtonEnabled: false,
          }

    const livePostGuards = {
      loggedIn,
      uploadPageReady: readiness.uploadPageReady,
      postButtonVisible: staging.postButtonVisible,
      postButtonEnabled: staging.postButtonEnabled,
      mediaAttached: Boolean(mediaPath && mediaSizeBytes),
      captionPresent: staging.captionFilled || staging.captionPresent,
      channelProfileMatches: true,
      finalPostFlagAllowed: options.allowFinalPost,
      finalPostEnvAllowed: process.env.RBHQ_TIKTOK_LIVE_POSTING_ALLOWED === 'true',
    }
    const livePostBlocker = options.mode === 'live-post'
      ? !livePostGuards.loggedIn ? 'TIKTOK_LOGIN_REQUIRED'
        : !livePostGuards.uploadPageReady ? 'TIKTOK_UPLOAD_PAGE_NOT_READY'
          : !livePostGuards.mediaAttached ? 'ASSET_MISSING'
            : !livePostGuards.captionPresent ? 'TIKTOK_CAPTION_NOT_FILLED'
              : !livePostGuards.postButtonVisible ? 'TIKTOK_POST_BUTTON_NOT_VISIBLE'
                : !livePostGuards.postButtonEnabled ? 'TIKTOK_POST_BUTTON_DISABLED'
                  : !livePostGuards.channelProfileMatches ? 'TIKTOK_CHANNEL_MISMATCH'
                    : !livePostGuards.finalPostFlagAllowed ? 'TIKTOK_FINAL_POST_FLAG_MISSING'
                      : !livePostGuards.finalPostEnvAllowed ? 'TIKTOK_LIVE_POST_ENV_MISSING'
                        : null
      : null

    const livePost = options.mode === 'live-post' && !blocker && !livePostBlocker
      ? await clickFinalPost(page, options.timeoutMs)
      : options.mode === 'live-post'
        ? {
            requested: true,
            clickedFinalPost: false,
            status: 'blocked',
            confirmation: 'not_clicked',
            blocker: blocker || livePostBlocker,
          }
        : null

    const stagedScreenshotPath =
      staging.uploadStaged
        ? await screenshot(page, options.artifactDir, `${clipId}-staged-upload.png`)
        : null

    const finalScreenshotPath =
      livePost?.clickedFinalPost
        ? await screenshot(page, options.artifactDir, `${clipId}-post-click-result.png`)
        : null

    result = {
      result: options.mode === 'live-post'
        ? livePost?.status === 'posted'
          ? 'POST_CONFIRMED'
          : livePost?.status === 'post_confirmation_needed'
            ? 'POST_CONFIRMATION_NEEDED'
            : 'BLOCKED'
        : options.mode === 'login'
        ? 'LOGIN_BROWSER_OPEN'
        : options.mode === 'session-check'
          ? 'SESSION_CHECK'
          : blocker ? 'BLOCKED' : 'READY',
      blocker: options.mode === 'live-post' ? livePost?.blocker ?? null : blocker,
      channelKey,
      draftPath: absoluteDraftPath,
      clipId,
      mediaPath,
      mediaExists: Boolean(mediaPath),
      mediaSizeBytes,
      uploadUrl: options.uploadUrl,
      profileRoot: profilePaths.profileRoot,
      profileDir,
      profileOverride: profilePaths.profileOverride,
      browser: options.headless ? 'headless' : 'headed',
      browserEngine: browserSession.connection,
      cdpEndpoint: options.browser === 'cdp' ? options.cdpEndpoint : null,
      logged_in: loggedIn,
      readiness,
      staging: {
        requested: options.stageUpload,
        ...staging,
        stoppedBeforeFinalPost: options.mode === 'live-post' ? !livePost?.clickedFinalPost : true,
        manualApprovalRequired: options.mode === 'live-post' ? livePost?.status !== 'posted' : true,
      },
      livePost,
      livePostGuards: options.mode === 'live-post' ? livePostGuards : null,
      artifacts: {
        uploadPageScreenshot: screenshotPath,
        stagedUploadScreenshot: stagedScreenshotPath,
        finalPostScreenshot: finalScreenshotPath,
      },
      safety: {
        usesTikTokApi: false,
        storesTikTokCredentialsInRbhq: false,
        marksRbhqPublished: false,
        clicksFinalPost: Boolean(livePost?.clickedFinalPost),
      },
    }

    console.log(JSON.stringify(result, null, 2))

    if (options.keepOpen) {
      console.error('Browser left open because --keep-open was provided. Press Ctrl+C here when done.')
      await new Promise(() => undefined)
    }
  } finally {
    if (!options.keepOpen) {
      await browserSession.close()
    }
  }
}

void main().catch((error) => {
  console.error(JSON.stringify(
    {
      result: 'FAIL',
      blocker: 'SCRIPT_ERROR',
      error: error instanceof Error ? error.message : String(error),
      safety: {
        usesTikTokApi: false,
        storesTikTokCredentialsInRbhq: false,
        marksRbhqPublished: false,
        clicksFinalPost: false,
      },
    },
    null,
    2,
  ))
  process.exitCode = 1
})
