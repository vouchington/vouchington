import path from 'node:path'
import fs from 'node:fs/promises'
import { PlaywrightBlocker } from '@ghostery/adblocker-playwright'
import onError from '@modules/on-error'

const ADBLOCKER_CACHE_PATH =
  process.env.ADBLOCKER_CACHE_PATH ??
  path.join(process.env.TMPDIR ?? '/tmp', 'adblocker-engine.bin')
const ADBLOCKER_FETCH_TIMEOUT_MS = 30_000
const BLOCKER_FETCH_RETRY_MS = 5 * 60 * 1_000

let cachedBlocker: PlaywrightBlocker | null = null
let blockerFetchFailedAt = 0

export async function getBlocker(): Promise<PlaywrightBlocker | null> {
  if (cachedBlocker) return cachedBlocker
  const diskBlocker = await readBlockerFromDisk()
  if (diskBlocker) return diskBlocker
  if (blockerFetchFailedAt && Date.now() - blockerFetchFailedAt < BLOCKER_FETCH_RETRY_MS)
    return null
  return fetchAndCacheBlocker()
}

async function readBlockerFromDisk(): Promise<PlaywrightBlocker | null> {
  let diskData: Buffer | undefined
  try {
    diskData = await fs.readFile(ADBLOCKER_CACHE_PATH)
  } catch {
    return null
  }
  try {
    cachedBlocker = PlaywrightBlocker.deserialize(diskData)
    return cachedBlocker
  } catch {
    await fs.unlink(ADBLOCKER_CACHE_PATH).catch(onError)
    return null
  }
}

async function fetchAndCacheBlocker(): Promise<PlaywrightBlocker | null> {
  let blocker: PlaywrightBlocker
  let fetchTimeoutHandle: ReturnType<typeof setTimeout> | undefined
  try {
    blocker = await Promise.race([
      PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch),
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
  await writeBlockerToDisk(blocker)
  return blocker
}

async function writeBlockerToDisk(blocker: PlaywrightBlocker) {
  const tmpPath = `${ADBLOCKER_CACHE_PATH}.tmp`
  try {
    await fs.writeFile(tmpPath, blocker.serialize())
    await fs.rename(tmpPath, ADBLOCKER_CACHE_PATH)
  } catch (err: unknown) {
    console.error('Failed to write adblocker cache', err)
    await fs.unlink(tmpPath).catch(onError)
  }
}
