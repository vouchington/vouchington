import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assertRssFeedUrlExists } from '../validate.mts'

describe('assertRssFeedUrlExists', () => {
  const originalPlaywrightTest = process.env.PLAYWRIGHT_TEST

  beforeEach(() => {
    delete process.env.PLAYWRIGHT_TEST
  })

  afterEach(() => {
    if (originalPlaywrightTest === undefined) {
      delete process.env.PLAYWRIGHT_TEST
    } else {
      process.env.PLAYWRIGHT_TEST = originalPlaywrightTest
    }
  })

  it('calls the injected crawler to validate feed URLs', async () => {
    const crawlerRss = vi.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
      feed: { title: 'Test Feed' },
    })

    await expect(
      assertRssFeedUrlExists('https://example.com/feed.xml', { crawlerRss }),
    ).resolves.toBeUndefined()

    expect(crawlerRss).toHaveBeenCalledWith('https://example.com/feed.xml')
  })
})
