import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addUrl } from '@services/urls/upsert'
import { createCrawler } from '@services/crawlers'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import { getCrawlChunks } from '@voucha/test-helpers/entities/crawl-chunks'
import { useCrawlUrlRedirectHarness } from '@voucha/test-helpers/services/crawls/crawl-url-redirect-harness'
import { crawlUrl } from '../crawl-url.mts'

describe('crawlUrl total deadlines', () => {
  const { crawlUrlForTest, fetchCrawlerHtml, createMockCrawlerResult, user } =
    useCrawlUrlRedirectHarness()

  it('returns null for a missing URL with options omitted', async () => {
    await expect(crawlUrl(randomUUID())).resolves.toBeNull()
  })

  describe('owned URL budgets', () => {
    let url: NonNullable<Awaited<ReturnType<typeof addUrl>>>

    beforeEach(async () => {
      const created = await addUrl(user().id, `https://deadline-${randomUUID()}.example.com/`)
      if (!created) throw new Error('Expected owned crawl URL')
      url = created
      await Promise.all([
        createCrawler(user(), { hostname_id: url.hostname.id, crawler_type: 'fetch' }),
        updateUrlHostname(url.hostname.id, { is_crawlable: true }),
      ])
    })

    it('uses the literal default total budget with an already expired origin', async () => {
      await expect(crawlUrlForTest(url.id, 0, undefined, { startedAt: 0 })).rejects.toMatchObject({
        name: 'CrawlerTimeoutError',
        status: 504,
        message: `Request to ${url.url} timed out after 60000ms`,
      })
      expect(fetchCrawlerHtml).not.toHaveBeenCalled()
    })

    it('uses an explicit totalTimeoutMs with an already expired origin', async () => {
      await expect(
        crawlUrlForTest(url.id, 0, undefined, { totalTimeoutMs: 500, startedAt: 0 }),
      ).rejects.toMatchObject({
        name: 'CrawlerTimeoutError',
        status: 504,
        message: `Request to ${url.url} timed out after 500ms`,
      })
      expect(fetchCrawlerHtml).not.toHaveBeenCalled()
    })

    it('inherits an expired deadline instead of resetting it to a future origin', async () => {
      await expect(
        crawlUrlForTest(url.id, 0, undefined, {
          deadlineAt: 0,
          totalTimeoutMs: 500,
          startedAt: Number.MAX_SAFE_INTEGER - 60_000,
        }),
      ).rejects.toMatchObject({
        name: 'CrawlerTimeoutError',
        status: 504,
        message: `Request to ${url.url} timed out after 500ms`,
      })
      expect(fetchCrawlerHtml).not.toHaveBeenCalled()
    })

    it('preserves ignoreRobotsTxt and skipChunks with a far-future origin', async () => {
      const checkRobots = vi.fn<() => Promise<boolean>>().mockResolvedValue(false)
      fetchCrawlerHtml.mockResolvedValueOnce(createMockCrawlerResult(200))

      const result = await crawlUrlForTest(url.id, 0, undefined, {
        ignoreRobotsTxt: true,
        skipChunks: true,
        startedAt: Number.MAX_SAFE_INTEGER - 60_000,
        dependencies: { isUrlCrawlable: checkRobots },
      })

      expect(result).toMatchObject({
        response_status_code: 200,
        title: 'Test',
        markdown: 'Test content',
      })
      expect(checkRobots).not.toHaveBeenCalled()
      expect(await getCrawlChunks(url.id, result!.id)).toEqual([])
    })
  })
})
