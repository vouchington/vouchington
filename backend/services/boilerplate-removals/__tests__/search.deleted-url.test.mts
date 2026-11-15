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
              1,
            ).then(page => ({
              count: page.candidates.length,
              url: page.after,
              crawl: page.crawl_after,
            }))
          : await searchParentPathsNeedingBoilerplateRemoval([hostnameId], 1).then(page => ({
              count: page.candidates.length,
              url: page.after?.url_id,
              crawl: page.after?.crawl_id,
            }))
      expect(first).toEqual({ count: 0, url: pendingUrlId, crawl: rejectedCrawlId })
      await hardDeleteTestUrl(pendingUrlId)
      const second =
        surface === 'crawler'
          ? await searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
              hostnameId,
              '/blog',
              2,
              {},
              () => now,
              first.url,
              first.crawl,
            )
          : await searchParentPathsNeedingBoilerplateRemoval([hostnameId], 2, {
              after: { hostname_id: hostnameId, url_id: first.url!, crawl_id: first.crawl },
            })
      expect(second.candidates).toHaveLength(1)
      expect(second.after).toBeUndefined()
    },
  )
})
