import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { insertTestCrawl, insertTestUrl, insertTestUrlHostname } from '@voucha/test-helpers'
import { withCapturedTestQueries } from '@voucha/test-helpers/query-capture'
import { deleteTestCrawl } from '@voucha/test-helpers/entities/referral-link-crawl-pointers'
import { searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId } from './boilerplate-removal.mts'

describe('boilerplate inspection progress', () => {
  it('continues below a deleted uninspected crawl ID with a one-row budget', async () => {
    const hostname = `crawler-deleted-probe-${randomUUID()}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const urlId = await insertTestUrl({ hostnameId, url: `https://${hostname}/blog/one` })
    const now = new Date()
    const { id: validId } = await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: '',
      completedAt: now,
      htmlSha256: Buffer.alloc(32, 1),
      htmlSnapshotUploadedAt: now,
    })
    const { id: deletedId } = await insertTestCrawl({
      urlId,
      statusCode: 304,
      markdown: '',
      completedAt: now,
    })
    const first = await searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
      hostnameId,
      '/blog',
      1,
    )
    expect(first).toEqual({ candidates: [], after: urlId, crawl_probe_id: deletedId })
    await deleteTestCrawl(deletedId)
    const second = await searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
      hostnameId,
      '/blog',
      1,
      {},
      () => now,
      first.after,
      first.crawl_after,
      first.crawl_probe_id,
    )
    expect(second).toEqual({ candidates: [], after: urlId, crawl_after: deletedId })
    const third = await searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
      hostnameId,
      '/blog',
      1,
      {},
      () => now,
      second.after,
      second.crawl_after,
      second.crawl_probe_id,
    )
    expect(third).toEqual({
      candidates: [],
      after: urlId,
      crawl_after: deletedId,
      crawl_probe_id: validId,
    })
    const fourth = await searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
      hostnameId,
      '/blog',
      1,
      {},
      () => now,
      third.after,
      third.crawl_after,
      third.crawl_probe_id,
    )
    expect(fourth).toEqual({
      candidates: [{ id: urlId, url: `https://${hostname}/blog/one`, crawl_id: validId }],
      after: urlId,
    })
    expect(
      await searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
        hostnameId,
        '/blog',
        1,
        {},
        () => now,
        fourth.after,
      ),
    ).toEqual({ candidates: [], after: undefined })
  })

  it('finishes a rejected crawl tail before advancing to later probed URLs', async () => {
    const hostname = `crawler-batched-tail-${randomUUID()}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const firstId = await insertTestUrl({ hostnameId, url: `https://${hostname}/blog/first` })
    const secondId = await insertTestUrl({ hostnameId, url: `https://${hostname}/blog/second` })
    const now = new Date()
    const { id: firstCrawlId } = await insertTestCrawl({
      urlId: firstId,
      statusCode: 200,
      markdown: '',
      completedAt: now,
      htmlSha256: Buffer.alloc(32, 1),
      htmlSnapshotUploadedAt: now,
    })
    const rejectedIds: string[] = []
    for (const index of [0, 1, 2, 3]) {
      const { id } = await insertTestCrawl({
        urlId: firstId,
        statusCode: 200,
        markdown: String(index),
        completedAt: now,
      })
      rejectedIds.push(id)
    }
    const { id: secondCrawlId } = await insertTestCrawl({
      urlId: secondId,
      statusCode: 200,
      markdown: '',
      completedAt: now,
      htmlSha256: Buffer.alloc(32, 2),
      htmlSnapshotUploadedAt: now,
    })
    const first = await withCapturedTestQueries(() =>
      searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(hostnameId, '/blog', 4),
    )
    expect(first.result).toEqual({ candidates: [], after: firstId, crawl_after: rejectedIds[3] })
    expect(first.queries).toHaveLength(3)
    const second = await withCapturedTestQueries(() =>
      searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
        hostnameId,
        '/blog',
        4,
        {},
        () => now,
        first.result.after,
        first.result.crawl_after,
      ),
    )
    expect(second.result).toEqual({ candidates: [], after: firstId, crawl_after: rejectedIds[1] })
    expect(second.queries).toHaveLength(3)
    const third = await withCapturedTestQueries(() =>
      searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
        hostnameId,
        '/blog',
        4,
        {},
        () => now,
        second.result.after,
        second.result.crawl_after,
      ),
    )
    expect(third.result).toEqual({
      candidates: [{ id: firstId, url: `https://${hostname}/blog/first`, crawl_id: firstCrawlId }],
      after: firstId,
    })
    expect(third.queries).toHaveLength(3)
    const fourth = await withCapturedTestQueries(() =>
      searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
        hostnameId,
        '/blog',
        4,
        {},
        () => now,
        third.result.after,
        third.result.crawl_after,
      ),
    )
    expect(fourth.result).toEqual({
      candidates: [
        { id: secondId, url: `https://${hostname}/blog/second`, crawl_id: secondCrawlId },
      ],
      after: undefined,
    })
    expect(fourth.queries).toHaveLength(3)
  })
})
