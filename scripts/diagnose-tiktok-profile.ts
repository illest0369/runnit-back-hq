import { copyFile, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

type ChannelKey = 'rb_sports' | 'rb_arena' | 'rb_women' | 'rb_combat' | 'rb_futbol' | 'rb_cfb'

type CookieDbDiagnostic = {
  path: string
  exists: boolean
  sizeBytes: number | null
  tiktokCookieCount: number | null
  tiktokSessionCookieCount: number | null
  tiktokSessionCookieNameCount: number | null
  error: string | null
}

const DEFAULT_PROFILE_ROOT = path.join(os.homedir(), 'rbhq-browser-profiles')
const CHANNEL_PROFILE_DIRS: Record<ChannelKey, string> = {
  rb_sports: 'tiktok-rb-sports',
  rb_arena: 'tiktok-rb-arena',
  rb_women: 'tiktok-rb-women',
  rb_combat: 'tiktok-rb-combat',
  rb_futbol: 'tiktok-rb-futbol',
  rb_cfb: 'tiktok-rb-cfb',
}
const SESSION_COOKIE_NAMES = [
  'sessionid',
  'sessionid_ss',
  'sid_tt',
  'sid_guard',
  'uid_tt',
  'uid_tt_ss',
]

function readFlagValue(name: string): string | null {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : null
  return value && !value.startsWith('--') ? value : null
}

function normalizeChannelKey(value: string): ChannelKey {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const aliases: Record<string, ChannelKey> = {
    rb_sports: 'rb_sports',
    sports: 'rb_sports',
    tiktok_rb_sports: 'rb_sports',
    rb_arena: 'rb_arena',
    arena: 'rb_arena',
    rb_women: 'rb_women',
    women: 'rb_women',
    rb_combat: 'rb_combat',
    combat: 'rb_combat',
    rb_futbol: 'rb_futbol',
    futbol: 'rb_futbol',
    soccer: 'rb_futbol',
    rb_cfb: 'rb_cfb',
    cfb: 'rb_cfb',
  }
  const channelKey = aliases[normalized]
  if (!channelKey) {
    throw new Error(`Unsupported channel: ${value}. Supported channels: ${Object.keys(CHANNEL_PROFILE_DIRS).join(', ')}`)
  }
  return channelKey
}

function resolveProfileRoot(): string {
  return path.resolve(process.env.TIKTOK_BROWSER_PROFILE_ROOT?.trim() || DEFAULT_PROFILE_ROOT)
}

function resolveProfileDir(channelKey: ChannelKey): string {
  const override = readFlagValue('--profile-dir') || process.env.TIKTOK_PLAYWRIGHT_PROFILE
  if (override?.trim()) return path.resolve(override)
  return path.join(resolveProfileRoot(), CHANNEL_PROFILE_DIRS[channelKey])
}

async function exists(filePath: string): Promise<boolean> {
  return Boolean(await stat(filePath).catch(() => null))
}

async function fileSize(filePath: string): Promise<number | null> {
  const fileStat = await stat(filePath).catch(() => null)
  return fileStat?.isFile() ? fileStat.size : null
}

async function findFiles(root: string, fileName: string, maxDepth = 5): Promise<string[]> {
  const found: string[] = []

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name)
      if (entry.isFile() && entry.name === fileName) {
        found.push(entryPath)
      } else if (entry.isDirectory()) {
        await walk(entryPath, depth + 1)
      }
    }
  }

  await walk(root, 0)
  return found.sort()
}

function countFromRow(row: unknown): number {
  if (!row || typeof row !== 'object') return 0
  const value = (row as { count?: unknown }).count
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function queryCount(db: DatabaseSync, sql: string): number {
  return countFromRow(db.prepare(sql).get())
}

async function copyCookieDbForRead(cookieDbPath: string, tmpRoot: string): Promise<string> {
  const tmpDbPath = path.join(tmpRoot, 'Cookies')
  await copyFile(cookieDbPath, tmpDbPath)

  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${cookieDbPath}${suffix}`
    if (await exists(sidecar)) {
      await copyFile(sidecar, `${tmpDbPath}${suffix}`)
    }
  }

  return tmpDbPath
}

async function diagnoseCookieDb(cookieDbPath: string, tmpParent: string): Promise<CookieDbDiagnostic> {
  const sizeBytes = await fileSize(cookieDbPath)
  if (sizeBytes === null) {
    return {
      path: cookieDbPath,
      exists: false,
      sizeBytes,
      tiktokCookieCount: null,
      tiktokSessionCookieCount: null,
      tiktokSessionCookieNameCount: null,
      error: null,
    }
  }

  const tmpRoot = await mkdtemp(path.join(tmpParent, 'cookies-'))
  try {
    const tmpDbPath = await copyCookieDbForRead(cookieDbPath, tmpRoot)
    const db = new DatabaseSync(tmpDbPath)
    try {
      const sessionNameList = SESSION_COOKIE_NAMES.map((name) => `'${name}'`).join(', ')
      return {
        path: cookieDbPath,
        exists: true,
        sizeBytes,
        tiktokCookieCount: queryCount(db, "SELECT COUNT(*) AS count FROM cookies WHERE host_key LIKE '%tiktok.com'"),
        tiktokSessionCookieCount: queryCount(db, `SELECT COUNT(*) AS count FROM cookies WHERE host_key LIKE '%tiktok.com' AND lower(name) IN (${sessionNameList})`),
        tiktokSessionCookieNameCount: queryCount(db, `SELECT COUNT(DISTINCT lower(name)) AS count FROM cookies WHERE host_key LIKE '%tiktok.com' AND lower(name) IN (${sessionNameList})`),
        error: null,
      }
    } finally {
      db.close()
    }
  } catch (error) {
    return {
      path: cookieDbPath,
      exists: true,
      sizeBytes,
      tiktokCookieCount: null,
      tiktokSessionCookieCount: null,
      tiktokSessionCookieNameCount: null,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    await rm(tmpRoot, { recursive: true, force: true })
  }
}

async function readLocalStateSummary(localStatePath: string): Promise<Record<string, unknown>> {
  const raw = await readFile(localStatePath, 'utf8').catch(() => null)
  if (!raw) return { exists: false, parseable: false }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const profile = parsed.profile && typeof parsed.profile === 'object'
      ? parsed.profile as Record<string, unknown>
      : {}
    const infoCache = profile.info_cache && typeof profile.info_cache === 'object'
      ? profile.info_cache as Record<string, unknown>
      : {}

    return {
      exists: true,
      parseable: true,
      sizeBytes: raw.length,
      profileInfoCacheKeys: Object.keys(infoCache).sort(),
      hasOsCryptSection: Boolean(parsed.os_crypt),
    }
  } catch (error) {
    return {
      exists: true,
      parseable: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function main() {
  const channelKey = normalizeChannelKey(readFlagValue('--channel') || 'rb_sports')
  const profileRoot = resolveProfileRoot()
  const profileDir = resolveProfileDir(channelKey)
  const profileExists = await exists(profileDir)
  const localStatePath = path.join(profileDir, 'Local State')
  const cookieDbPaths = profileExists ? await findFiles(profileDir, 'Cookies') : []
  const tmpParent = await mkdtemp(path.join(os.tmpdir(), 'rbhq-tiktok-profile-'))

  try {
    const cookieDbs = []
    for (const cookieDbPath of cookieDbPaths) {
      cookieDbs.push(await diagnoseCookieDb(cookieDbPath, tmpParent))
    }

    const tiktokCookieCount = cookieDbs.reduce((sum, db) => sum + (db.tiktokCookieCount ?? 0), 0)
    const tiktokSessionCookieCount = cookieDbs.reduce((sum, db) => sum + (db.tiktokSessionCookieCount ?? 0), 0)
    const tiktokSessionCookieNameCount = cookieDbs.reduce((sum, db) => sum + (db.tiktokSessionCookieNameCount ?? 0), 0)

    console.log(JSON.stringify({
      result: 'PASS',
      channelKey,
      profileRoot,
      profileDir,
      profileExists,
      localStatePath,
      localState: await readLocalStateSummary(localStatePath),
      cookieDbPaths,
      cookieDbs,
      aggregate: {
        cookieDbCount: cookieDbs.length,
        tiktokCookieCount,
        tiktokSessionCookieCount,
        tiktokSessionCookieNameCount,
        authenticatedSessionCookiesPresent: tiktokSessionCookieCount > 0,
      },
      safety: {
        startsBrowser: false,
        readsCookieValues: false,
        printsCookieValues: false,
        uploadsToTikTok: false,
        clicksFinalPost: false,
        marksLivePublished: false,
      },
    }, null, 2))
  } finally {
    await rm(tmpParent, { recursive: true, force: true })
  }
}

void main().catch((error) => {
  console.error(JSON.stringify({
    result: 'FAIL',
    error: error instanceof Error ? error.message : String(error),
    safety: {
      startsBrowser: false,
      readsCookieValues: false,
      printsCookieValues: false,
      uploadsToTikTok: false,
      clicksFinalPost: false,
      marksLivePublished: false,
    },
  }, null, 2))
  process.exitCode = 1
})
