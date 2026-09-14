import path from 'node:path'
import type fs from 'node:fs/promises'
import type { PlaywrightBlocker } from '@ghostery/adblocker-playwright'
import onError from '@modules/on-error'

const ADBLOCKER_CACHE_PATH =
  process.env.ADBLOCKER_CACHE_PATH ??
  path.join(process.env.TMPDIR ?? '/tmp', 'adblocker-engine.bin')
const ADBLOCKER_FETCH_TIMEOUT_MS = 30_000
const BLOCKER_FETCH_RETRY_MS = 5 * 60 * 1_000

export type BrowserAdblockerDependencies = {
  readFile: typeof fs.readFile
  writeFile: typeof fs.writeFile
  rename: typeof fs.rename
  unlink: typeof fs.unlink
  deserializeBlocker: (data: Buffer) => PlaywrightBlocker
  fromPrebuiltAdsAndTracking: (fetchImpl: typeof fetch) => Promise<PlaywrightBlocker>
}

let cachedBlocker: PlaywrightBlocker | null = null
let blockerFetchFailedAt = 0

export async function getBlocker(
  dependencies: BrowserAdblockerDependencies,
): Promise<PlaywrightBlocker | null> {
  if (cachedBlocker) return cachedBlocker
  const diskBlocker = await readBlockerFromDisk(dependencies)
  if (diskBlocker) return diskBlocker
  if (blockerFetchFailedAt && Date.now() - blockerFetchFailedAt < BLOCKER_FETCH_RETRY_MS)
    return null
  return fetchAndCacheBlocker(dependencies)
}

async function readBlockerFromDisk(
  dependencies: BrowserAdblockerDependencies,
): Promise<PlaywrightBlocker | null> {
  let diskData: Buffer | undefined
  try {
    diskData = await dependencies.readFile(ADBLOCKER_CACHE_PATH)
  } catch {
    return null
  }
  try {
    cachedBlocker = dependencies.deserializeBlocker(diskData)
    return cachedBlocker
  } catch {
    await dependencies.unlink(ADBLOCKER_CACHE_PATH).catch(onError)
    return null
  }
}

async function fetchAndCacheBlocker(
  dependencies: BrowserAdblockerDependencies,
): Promise<PlaywrightBlocker | null> {
  let blocker: PlaywrightBlocker
  let fetchTimeoutHandle: ReturnType<typeof setTimeout> | undefined
  try {
    blocker = await Promise.race([
      dependencies.fromPrebuiltAdsAndTracking(fetch),
      new Promise<never>((_, reject) => {
        fetchTimeoutHandle = setTimeout(
          () =>
            reject(new Error(`adblocker fetch timed out after ${ADBLOCKER_FETCH_TIMEOUT_MS}ms`)),
          ADBLOCKER_FETCH_TIMEOUT_MS,
        )
        fetchTimeoutHandle.unref()
      }),
    ])
  } catch (err) {
    blockerFetchFailedAt = Date.now()
    console.error('Failed to load adblocker filter list; crawling without ad-blocking', err)
    return null
  } finally {
    clearTimeout(fetchTimeoutHandle)
  }
  cachedBlocker = blocker
  await writeBlockerToDisk(blocker, dependencies)
  return blocker
}

async function writeBlockerToDisk(
  blocker: PlaywrightBlocker,
  dependencies: BrowserAdblockerDependencies,
) {
  const tmpPath = `${ADBLOCKER_CACHE_PATH}.tmp`
  try {
    await dependencies.writeFile(tmpPath, blocker.serialize())
    await dependencies.rename(tmpPath, ADBLOCKER_CACHE_PATH)
  } catch (err: unknown) {
    console.error('Failed to write adblocker cache', err)
    await dependencies.unlink(tmpPath).catch(onError)
  }
}

export function resetBlockerForTesting(): void {
  cachedBlocker = null
  blockerFetchFailedAt = 0
}
