import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { insertTestCrawl, insertTestUrl, insertTestUrlHostname } from '@voucha/test-helpers'
import { CRAWL_HTML_SNAPSHOT_RETENTION_DAYS } from '../crawls/constants.mts'
import { searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId } from './boilerplate-removal.mts'

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

    const candidates = await searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
      hostnameId,
      '/blog',
      10,
      {},
      () => now,
    )

    expect(candidates.map(candidate => candidate.id).toSorted()).toEqual(expectedIds.toSorted())
  })
})
