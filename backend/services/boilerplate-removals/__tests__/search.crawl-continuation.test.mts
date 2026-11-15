import { randomUUID } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { insertTestUrlHostname, insertTestUrl, insertTestCrawl } from '@voucha/test-helpers'
import { searchParentPathsNeedingBoilerplateRemoval } from '../search.mts'

describe('boilerplate discovery crawl continuation', () => {
  it('retains the current URL while its rejected crawl page needs continuation', async () => {
    const hostname = `bp-inner-cursor-${randomUUID()}.example.com`
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
    const { id: rejectedId } = await insertTestCrawl({
      urlId,
      statusCode: 304,
      markdown: '',
      completedAt: now,
    })
    const first = await searchParentPathsNeedingBoilerplateRemoval([hostnameId], 1)
    expect(first).toEqual({
      candidates: [],
      after: { hostname_id: hostnameId, url_id: urlId, probe_id: rejectedId },
    })
    const second = await searchParentPathsNeedingBoilerplateRemoval([hostnameId], 1, {
      after: first.after,
    })
    expect(second).toEqual({
      candidates: [],
      after: { hostname_id: hostnameId, url_id: urlId, crawl_id: rejectedId },
    })
    const third = await searchParentPathsNeedingBoilerplateRemoval([hostnameId], 1, {
      after: second.after,
    })
    expect(third).toEqual({
      candidates: [],
      after: { hostname_id: hostnameId, url_id: urlId, crawl_id: rejectedId, probe_id: validId },
    })
    const fourth = await searchParentPathsNeedingBoilerplateRemoval([hostnameId], 1, {
      after: third.after,
    })
    expect(fourth).toEqual({
      candidates: [{ hostname_id: hostnameId, parent_path: '/blog' }],
      after: { hostname_id: hostnameId, url_id: urlId },
    })
    expect(
      await searchParentPathsNeedingBoilerplateRemoval([hostnameId], 1, { after: fourth.after }),
    ).toEqual({ candidates: [], after: undefined })
  })
})
