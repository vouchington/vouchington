import { createHash, randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll } from 'vitest'
import { searchParentPathsNeedingBoilerplateRemoval } from './search.mts'
import { createBoilerplateRemoval } from './create.mts'
import { createTestRetentionWindow, createTestUser } from '@voucha/test-helpers'
import { addUrls } from '@services/urls/upsert'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import type { PrivateUser } from '@services/users/types'
import { createCrawler } from '@services/crawlers'
import { createCrawl } from '@services/crawls/create'
import { updateCrawl } from '@services/crawls/update'
import { setTestBoilerplateRemovalIdAt } from '@voucha/test-helpers/boilerplate-removals'
import { CRAWL_HTML_SNAPSHOT_RETENTION_DAYS } from '../crawls/constants.mts'

describe('search', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  describe('searchParentPathsNeedingBoilerplateRemoval', () => {
    it('should exclude parent paths with a boilerplate removal in the past 7 days', async () => {
      const hostname = `bp-test-recent-${Date.now()}.example.com`
      const urls = await addUrls(user.id, [
        `https://${hostname}/blog/post1`,
        `https://${hostname}/blog/post2`,
        `https://${hostname}/blog/post3`,
      ])
      await updateUrlHostname(urls[0]!.hostname.id, { is_crawlable: true })
      const crawler = await createCrawler(user, {
        hostname_id: urls[0]!.hostname.id,
        crawler_type: 'fetch',
      })
      await createEligibleCrawl(urls[0]!.id, crawler.id, new Date(Date.now() - 3 * 86400000))
      await createEligibleCrawl(urls[1]!.id, crawler.id, new Date(Date.now() - 2 * 86400000))
      await createEligibleCrawl(urls[2]!.id, crawler.id, new Date(Date.now() - 1 * 86400000))

      // Create a recent boilerplate removal (within 7 days)
      await createBoilerplateRemoval(
        urls[0]!.hostname.id,
        '/blog',
        { cssSelectorsToRemove: [], htmlToRemove: [] },
        urls.map(u => u.id),
      )

      const results = await searchParentPathsNeedingBoilerplateRemoval(100, {
        hostnameId: urls[0]!.hostname.id,
      })
      const match = results.find(
        r => r.hostname_id === urls[0]!.hostname.id && r.parent_path === '/blog',
      )
      expect(match).toBeUndefined()
    })

    it('should filter results to the specified hostnameId', async () => {
      const hostnameA = `bp-test-filter-a-${Date.now()}.example.com`
      const hostnameB = `bp-test-filter-b-${Date.now()}.example.com`

      const urlsA = await addUrls(user.id, [
        `https://${hostnameA}/articles/one`,
        `https://${hostnameA}/articles/two`,
      ])
      const urlsB = await addUrls(user.id, [
        `https://${hostnameB}/articles/one`,
        `https://${hostnameB}/articles/two`,
      ])
      await updateUrlHostname(urlsA[0]!.hostname.id, { is_crawlable: true })
      await updateUrlHostname(urlsB[0]!.hostname.id, { is_crawlable: true })
      const crawlerA = await createCrawler(user, {
        hostname_id: urlsA[0]!.hostname.id,
        crawler_type: 'fetch',
      })
      const crawlerB = await createCrawler(user, {
        hostname_id: urlsB[0]!.hostname.id,
        crawler_type: 'fetch',
      })
      await createEligibleCrawl(urlsA[0]!.id, crawlerA.id, new Date())
      await createEligibleCrawl(urlsA[1]!.id, crawlerA.id, new Date())
      await createEligibleCrawl(urlsB[0]!.id, crawlerB.id, new Date())
      await createEligibleCrawl(urlsB[1]!.id, crawlerB.id, new Date())

      const results = await searchParentPathsNeedingBoilerplateRemoval(100, {
        hostnameId: urlsA[0]!.hostname.id,
      })

      expect(results.every(r => r.hostname_id === urlsA[0]!.hostname.id)).toBe(true)
      expect(results.find(r => r.hostname_id === urlsB[0]!.hostname.id)).toBeUndefined()
    })

    it('should include parent paths without a recent boilerplate removal', async () => {
      const hostname = `bp-test-old-${Date.now()}.example.com`
      const urls = await addUrls(user.id, [
        `https://${hostname}/docs/page1`,
        `https://${hostname}/docs/page2`,
        `https://${hostname}/docs/page3`,
      ])
      await updateUrlHostname(urls[0]!.hostname.id, { is_crawlable: true })
      const crawler = await createCrawler(user, {
        hostname_id: urls[0]!.hostname.id,
        crawler_type: 'fetch',
      })
      await createEligibleCrawl(urls[0]!.id, crawler.id, new Date())
      await createEligibleCrawl(urls[1]!.id, crawler.id, new Date())
      await createEligibleCrawl(urls[2]!.id, crawler.id, new Date())

      // No boilerplate removal created, so this path should be included
      const results = await searchParentPathsNeedingBoilerplateRemoval(100, {
        hostnameId: urls[0]!.hostname.id,
      })
      const match = results.find(
        r => r.hostname_id === urls[0]!.hostname.id && r.parent_path === '/docs',
      )
      expect(match).toBeDefined()
    })

    it('should exclude parent paths whose S3 crawl snapshots are expired', async () => {
      const hostname = `bp-test-expired-snapshots-${Date.now()}.example.com`
      const urls = await addUrls(user.id, [
        `https://${hostname}/docs/page1`,
        `https://${hostname}/docs/page2`,
      ])
      await updateUrlHostname(urls[0]!.hostname.id, { is_crawlable: true })
      const crawler = await createCrawler(user, {
        hostname_id: urls[0]!.hostname.id,
        crawler_type: 'fetch',
      })
      await createEligibleCrawl(urls[0]!.id, crawler.id, new Date(), {
        snapshotUploadedAt: new Date(Date.now() - 8 * 86400000),
      })
      await createEligibleCrawl(urls[1]!.id, crawler.id, new Date(), {
        snapshotUploadedAt: new Date(Date.now() - 8 * 86400000),
      })

      const results = await searchParentPathsNeedingBoilerplateRemoval(100, {
        hostnameId: urls[0]!.hostname.id,
      })

      expect(
        results.find(r => r.hostname_id === urls[0]!.hostname.id && r.parent_path === '/docs'),
      ).toBeUndefined()
    })

    it('uses the exact UUIDv7 seven-day removal cutoff', async () => {
      const window = createTestRetentionWindow()
      const asOf = new Date(window.firstEligibleDate.getTime() + 7 * 86400000)
      const cutoff = asOf.getTime() - CRAWL_HTML_SNAPSHOT_RETENTION_DAYS * 86400000
      const hostname = `bp-cutoff-${randomUUID()}.example.com`
      const base = `https://${hostname}`
      const urls = await addUrls(
        user.id,
        [-1, 0, 1].flatMap(delta => [`${base}/edge-${delta}/one`, `${base}/edge-${delta}/two`]),
      )
      await updateUrlHostname(urls[0]!.hostname.id, { is_crawlable: true })
      const crawler = await createCrawler(user, {
        hostname_id: urls[0]!.hostname.id,
        crawler_type: 'fetch',
      })

      for (const [index, delta] of [-1, 0, 1].entries()) {
        const path = `/edge-${delta}`
        const pair = urls.slice(index * 2, index * 2 + 2)
        await createEligibleCrawl(pair[0]!.id, crawler.id, asOf)
        await createEligibleCrawl(pair[1]!.id, crawler.id, asOf)
        const removal = await createBoilerplateRemoval(
          urls[0]!.hostname.id,
          path,
          { cssSelectorsToRemove: [], htmlToRemove: [] },
          [],
        )
        await setTestBoilerplateRemovalIdAt(removal.id, new Date(cutoff + delta))
      }

      const results = await searchParentPathsNeedingBoilerplateRemoval(100, {
        hostnameId: urls[0]!.hostname.id,
        now: () => asOf,
      })

      expect(results.map(result => result.parent_path).toSorted()).toEqual(['/edge--1', '/edge-0'])
    })

    it.each([
      new Date('2024-01-31T23:59:59.999Z'),
      new Date('2024-02-01T00:00:00.001Z'),
      new Date('2024-02-29T23:59:59.999Z'),
      new Date('2024-03-01T00:00:00.001Z'),
      new Date('2024-12-31T23:59:59.999Z'),
      new Date('2025-01-01T00:00:00.001Z'),
    ])('checks independent timestamps at %s', async asOf => {
      const cutoff = asOf.getTime() - CRAWL_HTML_SNAPSHOT_RETENTION_DAYS * 86400000
      const hostname = `bp-fields-${randomUUID()}.example.com`
      const base = `https://${hostname}`
      const inputs = [
        { edge: 'completion', delta: -1 },
        { edge: 'completion', delta: 0 },
        { edge: 'completion', delta: 1 },
        { edge: 'upload', delta: -1 },
        { edge: 'upload', delta: 0 },
        { edge: 'upload', delta: 1 },
        { edge: 'legacy', delta: -1 },
        { edge: 'legacy', delta: 0 },
        { edge: 'legacy', delta: 1 },
      ] as const
      const urls = await addUrls(
        user.id,
        inputs.flatMap(({ edge, delta }) => [
          `${base}/${edge}-${delta}/one`,
          `${base}/${edge}-${delta}/two`,
        ]),
      )
      await updateUrlHostname(urls[0]!.hostname.id, { is_crawlable: true })
      const crawler = await createCrawler(user, {
        hostname_id: urls[0]!.hostname.id,
        crawler_type: 'fetch',
      })

      for (const [index, { edge, delta }] of inputs.entries()) {
        const completionAt = edge === 'upload' ? asOf : new Date(cutoff + delta)
        const uploadAt =
          edge === 'completion' ? asOf : edge === 'legacy' ? null : new Date(cutoff + delta)
        const firstUrl = urls[index * 2]!
        const secondUrl = urls[index * 2 + 1]!
        await createEligibleCrawl(firstUrl.id, crawler.id, completionAt, {
          snapshotUploadedAt: uploadAt,
        })
        await createEligibleCrawl(secondUrl.id, crawler.id, completionAt, {
          snapshotUploadedAt: uploadAt,
        })
      }

      const results = await searchParentPathsNeedingBoilerplateRemoval(100, {
        hostnameId: urls[0]!.hostname.id,
        now: () => asOf,
      })

      expect(results.map(result => result.parent_path).toSorted()).toEqual(
        inputs
          .filter(({ delta }) => delta >= 0)
          .map(({ edge, delta }) => `/${edge}-${delta}`)
          .toSorted(),
      )
    })

    it('rejects an invalid snapshot decision time before querying', async () => {
      await expect(
        searchParentPathsNeedingBoilerplateRemoval(100, { now: () => new Date(Number.NaN) }),
      ).rejects.toThrow('Invalid HTML snapshot decision time')
    })

    it('should include recent parent paths whose legacy snapshots have null upload timestamps', async () => {
      const hostname = `bp-test-legacy-snapshots-${Date.now()}.example.com`
      const urls = await addUrls(user.id, [
        `https://${hostname}/docs/page1`,
        `https://${hostname}/docs/page2`,
      ])
      await updateUrlHostname(urls[0]!.hostname.id, { is_crawlable: true })
      const crawler = await createCrawler(user, {
        hostname_id: urls[0]!.hostname.id,
        crawler_type: 'fetch',
      })
      await createEligibleCrawl(urls[0]!.id, crawler.id, new Date(), {
        snapshotUploadedAt: null,
      })
      await createEligibleCrawl(urls[1]!.id, crawler.id, new Date(), {
        snapshotUploadedAt: null,
      })

      const results = await searchParentPathsNeedingBoilerplateRemoval(100, {
        hostnameId: urls[0]!.hostname.id,
      })

      expect(
        results.find(r => r.hostname_id === urls[0]!.hostname.id && r.parent_path === '/docs'),
      ).toBeDefined()
    })
  })
})

async function createEligibleCrawl(
  urlId: string,
  crawlerId: string,
  completedAt: Date,
  options: { snapshotUploadedAt?: Date | null } = {},
) {
  const crawl = await createCrawl(urlId, crawlerId)
  const snapshotUploadedAt =
    'snapshotUploadedAt' in options ? (options.snapshotUploadedAt ?? null) : completedAt
  return updateCrawl(crawl.id, urlId, {
    response_status_code: 200,
    completed_at: completedAt,
    html_sha256: createHash('sha256').update(`${urlId}:${completedAt.toISOString()}`).digest(),
    html_snapshot_uploaded_at: snapshotUploadedAt,
  })
}
