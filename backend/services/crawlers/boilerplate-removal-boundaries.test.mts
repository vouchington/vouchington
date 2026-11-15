import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { insertTestCrawl, insertTestUrl, insertTestUrlHostname } from '@voucha/test-helpers'
import { CRAWL_HTML_SNAPSHOT_RETENTION_DAYS } from '../crawls/constants.mts'
import { searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId } from './boilerplate-removal.mts'
import { withCapturedTestQueries } from '@voucha/test-helpers/query-capture'

describe('crawler boilerplate removal snapshot retention', () => {
  it('rejects an invalid snapshot decision time before querying', async () => {
    await expect(
      searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
        randomUUID(),
        '/blog',
        10,
        {},
        () => new Date(Number.NaN),
      ),
    ).rejects.toThrow('Invalid HTML snapshot decision time')
  })

  it('batches empty and single-crawl URLs into a constant number of queries', async () => {
    const hostname = `crawler-batched-probes-${randomUUID()}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const now = new Date()
    const expectedIds: string[] = []
    for (const index of [0, 1, 2, 3, 4, 5]) {
      const urlId = await insertTestUrl({ hostnameId, url: `https://${hostname}/blog/${index}` })
      if (index % 2 === 1) {
        await insertTestCrawl({
          urlId,
          statusCode: 200,
          markdown: '',
          completedAt: now,
          htmlSha256: Buffer.alloc(32, index),
          htmlSnapshotUploadedAt: now,
        })
        expectedIds.push(urlId)
      }
    }
    const { result, queries } = await withCapturedTestQueries(() =>
      searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(hostnameId, '/blog', 12),
    )
    expect(result.candidates.map(candidate => candidate.id)).toEqual(expectedIds)
    expect(result.after).toBeUndefined()
    expect(result.crawl_after).toBeUndefined()
    expect(queries).toHaveLength(3)
  })

  it('shares the raw crawl budget across URLs and resumes the partially inspected URL', async () => {
    const hostname = `crawler-inner-cursor-${randomUUID()}.example.com`
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
    const { id: secondCrawlId } = await insertTestCrawl({
      urlId: secondId,
      statusCode: 200,
      markdown: '',
      completedAt: now,
      htmlSha256: Buffer.alloc(32, 2),
      htmlSnapshotUploadedAt: now,
    })
    await insertTestCrawl({ urlId: secondId, statusCode: 304, markdown: '', completedAt: now })
    const { id: rejectedId } = await insertTestCrawl({
      urlId: secondId,
      statusCode: 200,
      markdown: '',
      completedAt: now,
    })
    const first = await searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
      hostnameId,
      '/blog',
      4,
    )
    expect(first).toEqual({
      candidates: [{ id: firstId, url: `https://${hostname}/blog/first`, crawl_id: firstCrawlId }],
      after: secondId,
      crawl_after: rejectedId,
    })
    const second = await searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
      hostnameId,
      '/blog',
      4,
      {},
      () => now,
      first.after,
      first.crawl_after,
    )
    expect(second).toEqual({
      candidates: [
        { id: secondId, url: `https://${hostname}/blog/second`, crawl_id: secondCrawlId },
      ],
      after: undefined,
    })
  })

  it('advances past ineligible inspected URLs before returning a later candidate', async () => {
    const hostname = `crawler-cursor-${randomUUID()}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const firstId = await insertTestUrl({ hostnameId, url: `https://${hostname}/other/first` })
    const secondId = await insertTestUrl({ hostnameId, url: `https://${hostname}/blog/second` })
    const { id: crawlId } = await insertTestCrawl({
      urlId: secondId,
      statusCode: 200,
      markdown: '',
      completedAt: new Date(),
      htmlSha256: Buffer.alloc(32, 1),
      htmlSnapshotUploadedAt: new Date(),
    })
    const first = await searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
      hostnameId,
      '/blog',
      1,
    )
    expect(first).toEqual({ candidates: [], after: firstId })
    const second = await searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
      hostnameId,
      '/blog',
      1,
      {},
      () => new Date(),
      first.after,
    )
    expect(second).toEqual({ candidates: [], after: secondId, crawl_probe_id: crawlId })
    const third = await searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
      hostnameId,
      '/blog',
      1,
      {},
      () => new Date(),
      second.after,
      second.crawl_after,
      second.crawl_probe_id,
    )
    expect(third).toEqual({
      candidates: [{ id: secondId, url: `https://${hostname}/blog/second`, crawl_id: crawlId }],
      after: secondId,
    })
    expect(
      await searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
        hostnameId,
        '/blog',
        1,
        {},
        () => new Date(),
        third.after,
      ),
    ).toEqual({ candidates: [], after: undefined })
  })

  it.each([
    new Date('2024-01-31T23:59:59.999Z'),
    new Date('2024-02-01T00:00:00.001Z'),
    new Date('2024-02-29T23:59:59.999Z'),
    new Date('2024-03-01T00:00:00.001Z'),
    new Date('2024-12-31T23:59:59.999Z'),
    new Date('2025-01-01T00:00:00.001Z'),
  ])('checks independent timestamps at %s', async now => {
    const cutoff = now.getTime() - CRAWL_HTML_SNAPSHOT_RETENTION_DAYS * 86400000
    const hostname = `crawler-boundary-${randomUUID()}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const edges = [
      { field: 'completion', delta: -1 },
      { field: 'completion', delta: 0 },
      { field: 'completion', delta: 1 },
      { field: 'upload', delta: -1 },
      { field: 'upload', delta: 0 },
      { field: 'upload', delta: 1 },
      { field: 'legacy', delta: -1 },
      { field: 'legacy', delta: 0 },
      { field: 'legacy', delta: 1 },
    ] as const
    const expectedIds: string[] = []

    for (const { field, delta } of edges) {
      const urlId = await insertTestUrl({
        url: `https://${hostname}/blog/${field}-${delta}`,
        hostnameId,
      })
      const completedAt = field === 'upload' ? now : new Date(cutoff + delta)
      const uploadedAt =
        field === 'completion' ? now : field === 'legacy' ? undefined : new Date(cutoff + delta)
      await insertTestCrawl({
        urlId,
        statusCode: 200,
        markdown: '',
        completedAt,
        htmlSha256: Buffer.alloc(32, delta + 2),
        ...(uploadedAt ? { htmlSnapshotUploadedAt: uploadedAt } : {}),
      })
      if (delta >= 0) expectedIds.push(urlId)
    }

    let page = await searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
      hostnameId,
      '/blog',
      10,
      {},
      () => now,
    )
    const candidates = [...page.candidates]
    for (let step = 0; step < edges.length && page.after; step += 1) {
      page = await searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
        hostnameId,
        '/blog',
        10,
        {},
        () => now,
        page.after,
        page.crawl_after,
      )
      candidates.push(...page.candidates)
    }
    expect(page.after).toBeUndefined()
    expect(candidates.map(candidate => candidate.id).toSorted()).toEqual(expectedIds.toSorted())
  })
})
