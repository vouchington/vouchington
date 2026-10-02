import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assertRssFeedUrlExists, fetchAndClassifyFeed } from '../validate.mts'

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

  it('preserves the missing-feed contract when the crawler returns no feed content', async () => {
    await expect(
      assertRssFeedUrlExists('https://example.com/feed.xml', {
        crawlerRss: async () => ({
          responseCode: 200,
          feed: null,
          contentSha256: null,
          headers: { etag: null, lastModified: null },
        }),
      }),
    ).rejects.toMatchObject({
      code: 'RSS_FEED_URL_MISSING_CONTENT',
      message: 'RSS feed URL did not return feed content',
      status: 422,
      statusCode: 422,
    })
  })

  it('preserves the missing-feed contract when classification receives no feed content', async () => {
    await expect(
      fetchAndClassifyFeed('https://example.com/feed.xml', {
        crawlerRss: async () => ({
          responseCode: 200,
          feed: null,
          contentSha256: null,
          headers: { etag: null, lastModified: null },
        }),
      }),
    ).rejects.toMatchObject({
      code: 'RSS_FEED_URL_MISSING_CONTENT',
      message: 'RSS feed URL did not return feed content',
      status: 422,
      statusCode: 422,
    })
  })
})
