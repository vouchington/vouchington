import fs from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  makeMockBrowser,
  makeMockPage,
  skipHydrationWait,
  useAdblockerCachePath,
} from '@voucha/test-helpers/services/browser-crawl/crawl-fixtures'

type Fresh = Awaited<ReturnType<typeof loadFreshCrawl>>

async function loadFreshCrawl(options: { unwritable?: boolean } = {}) {
  const cachePath = await useAdblockerCachePath(options)
  vi.resetModules()
  const playwright = await import('playwright-core')
  const adblocker = await import('@ghostery/adblocker-playwright')
  const adblockerCache = await import('./adblocker-cache.mts')
  const crawl = await import('./crawl.mts')
  const connect = vi.spyOn(playwright.chromium, 'connectOverCDP')
  const download = vi
    .spyOn(adblocker.PlaywrightBlocker, 'fromPrebuiltAdsAndTracking')
    .mockResolvedValue(adblocker.PlaywrightBlocker.empty())
  const enableBlocking = vi
    .spyOn(adblocker.PlaywrightBlocker.prototype, 'enableBlockingInPage')
    .mockResolvedValue(undefined as never)
  skipHydrationWait()
  onTestFinished(() => {
    connect.mockRestore()
    download.mockRestore()
    enableBlocking.mockRestore()
  })
  connect.mockResolvedValue(makeMockBrowser(makeMockPage()) as never)
  return { adblocker, adblockerCache, cachePath, crawl, download, enableBlocking }
}

describe('adblocker disk cache', () => {
  let f: Fresh

  beforeEach(async () => {
    f = await loadFreshCrawl()
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
  })

  afterEach(() => {
    delete process.env.LIGHTPANDA_CDP_URL
    delete process.env.LIGHTPANDA_TOKEN
  })

  it('downloads once, enables blocking, and reuses the in-memory blocker on the second crawl', async () => {
    await f.crawl.crawlWithBrowser('https://example.com')
    await f.crawl.crawlWithBrowser('https://example.com')
    expect(f.download).toHaveBeenCalledTimes(1)
    expect(f.enableBlocking).toHaveBeenCalledTimes(2)
  })

  it('loads the blocker from the disk cache without downloading', async () => {
    const cached = f.adblocker.PlaywrightBlocker.empty().serialize()
    await fs.writeFile(f.cachePath, cached)
    await f.crawl.crawlWithBrowser('https://example.com')
    expect(f.download).not.toHaveBeenCalled()
    expect(f.enableBlocking).toHaveBeenCalledTimes(1)
    expect(f.enableBlocking.mock.contexts[0]).toBeInstanceOf(f.adblocker.PlaywrightBlocker)
    expect(await fs.readFile(f.cachePath)).toEqual(Buffer.from(cached))
  })

  it('replaces a corrupt cache file with a freshly downloaded blocker', async () => {
    await fs.writeFile(f.cachePath, 'corrupt-data')
    await f.crawl.crawlWithBrowser('https://example.com')
    expect(f.download).toHaveBeenCalledTimes(1)
    const fresh = f.adblocker.PlaywrightBlocker.empty().serialize()
    expect(await fs.readFile(f.cachePath)).toEqual(Buffer.from(fresh))
  })

  it('downloads a fresh blocker when no cache exists and writes it to disk', async () => {
    await f.crawl.crawlWithBrowser('https://example.com')
    expect(f.download).toHaveBeenCalledTimes(1)
    const fresh = f.adblocker.PlaywrightBlocker.empty().serialize()
    expect(await fs.readFile(f.cachePath)).toEqual(Buffer.from(fresh))
    await expect(fs.access(`${f.cachePath}.tmp`)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

describe('adblocker fetch failures', () => {
  let f: Fresh

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.LIGHTPANDA_CDP_URL
    delete process.env.LIGHTPANDA_TOKEN
  })

  it('crawls without a blocker when the download fails and does not retry within the cooldown', async () => {
    f = await loadFreshCrawl()
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
    f.download.mockRejectedValue(new Error('adblocker fetch timed out after 30000ms'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    onTestFinished(() => consoleSpy.mockRestore())
    await f.crawl.crawlWithBrowser('https://example.com')
    await f.crawl.crawlWithBrowser('https://example.com')
    expect(f.download).toHaveBeenCalledTimes(1)
    expect(f.enableBlocking).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to load adblocker filter list; crawling without ad-blocking',
      new Error('adblocker fetch timed out after 30000ms'),
    )
  })

  it('logs the failure but still crawls with the blocker when the disk write fails', async () => {
    f = await loadFreshCrawl({ unwritable: true })
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    onTestFinished(() => consoleSpy.mockRestore())
    const result = await f.crawl.crawlWithBrowser('https://example.com')
    expect(result.statusCode).toBe(200)
    expect(f.enableBlocking).toHaveBeenCalledTimes(1)
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to write adblocker cache',
      expect.objectContaining({ code: 'ENOENT' }),
    )
  })

  it('returns null when the adblocker download reaches its 30s timeout', async () => {
    f = await loadFreshCrawl()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    // The timeout timer is registered synchronously right after this stub returns, so advancing
    // from a microtask fires it with no real waiting.
    f.download.mockImplementation(() => {
      queueMicrotask(() => vi.advanceTimersByTime(30_000))
      return new Promise(() => {})
    })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    onTestFinished(() => consoleSpy.mockRestore())
    await expect(f.adblockerCache.getBlocker()).resolves.toBeNull()
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to load adblocker filter list; crawling without ad-blocking',
      new Error('adblocker fetch timed out after 30000ms'),
    )
  })
})
