import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { insertTestUrlHostname, insertTestUrl, insertTestCrawl } from '@voucha/test-helpers'
import { hardDeleteTestUrl } from '@voucha/test-helpers/entities/urls'
import { searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId } from '@services/crawlers/boilerplate-removal'
import { searchParentPathsNeedingBoilerplateRemoval } from '../search.mts'

describe('deleted boilerplate continuation URL', () => {
  it.each(['crawler', 'discovery'] as const)(
    'does not apply a deleted URL crawl cursor to another URL in %s',
    async surface => {
      const hostname = `deleted-cursor-${randomUUID()}.example.com`
      const hostnameId = await insertTestUrlHostname({ hostname, is_crawlable: true })
      const pendingUrlId = await insertTestUrl({
        hostnameId,
        url: `https://${hostname}/blog/pending`,
      })
      const nextUrlId = await insertTestUrl({ hostnameId, url: `https://${hostname}/blog/next` })
      const now = new Date()
      const { id: olderRejectedId } = await insertTestCrawl({
        urlId: pendingUrlId,
        statusCode: 304,
        markdown: '',
        completedAt: now,
      })
      const { id: rejectedCrawlId } = await insertTestCrawl({
        urlId: pendingUrlId,
        statusCode: 304,
        markdown: '',
        completedAt: now,
      })
      await insertTestCrawl({
        urlId: nextUrlId,
        statusCode: 200,
        markdown: '',
        completedAt: now,
        htmlSha256: Buffer.alloc(32, 1),
        htmlSnapshotUploadedAt: now,
      })
      const first =
        surface === 'crawler'
          ? await searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
              hostnameId,
              '/blog',
              2,
            ).then(page => ({
              count: page.candidates.length,
              url: page.after,
              crawl: page.crawl_after,
            }))
          : await searchParentPathsNeedingBoilerplateRemoval([hostnameId], 2).then(page => ({
              count: page.candidates.length,
              url: page.after?.url_id,
              crawl: page.after?.crawl_id,
            }))
      expect(first).toEqual({ count: 0, url: pendingUrlId, crawl: rejectedCrawlId })
      const pending =
        surface === 'crawler'
          ? await searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
              hostnameId,
              '/blog',
              1,
              {},
              () => now,
              first.url,
              first.crawl,
            ).then(page => ({
              url: page.after,
              crawl: page.crawl_after,
              probe: page.crawl_probe_id,
            }))
          : await searchParentPathsNeedingBoilerplateRemoval([hostnameId], 1, {
              after: { hostname_id: hostnameId, url_id: first.url!, crawl_id: first.crawl },
            }).then(page => ({
              url: page.after?.url_id,
              crawl: page.after?.crawl_id,
              probe: page.after?.probe_id,
            }))
      expect(pending).toEqual({ url: pendingUrlId, crawl: rejectedCrawlId, probe: olderRejectedId })
      await hardDeleteTestUrl(pendingUrlId)
      const second =
        surface === 'crawler'
          ? await searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
              hostnameId,
              '/blog',
              2,
              {},
              () => now,
              pending.url,
              pending.crawl,
              pending.probe,
            )
          : await searchParentPathsNeedingBoilerplateRemoval([hostnameId], 2, {
              after: {
                hostname_id: hostnameId,
                url_id: pending.url!,
                crawl_id: pending.crawl,
                probe_id: pending.probe,
              },
            })
      expect(second.candidates).toHaveLength(1)
      expect(second.after).toBeUndefined()
    },
  )
})
