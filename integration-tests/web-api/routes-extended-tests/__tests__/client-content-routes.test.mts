import { describe, expect, it } from 'vitest'

import * as clientRoutes from '@/lib/api/client'
import * as serverRoutes from '@/lib/api/server'
import {
  insertTestRssFeedCrawl,
  insertTestRssFeedDirect,
} from '../../../../backend/test-helpers/index.mts'
import { rss_feeds } from '../../../../backend/queues/rss-feeds/queues.mts'
import type { RssFeedResponseBody } from '@/types/api-responses'
import { installClientContentRouteHarness } from '../../../test-helpers/client-content-route-harness.mts'

function unset(target: object, key: string) {
  delete (target as Record<string, unknown>)[key]
}

describe('client-content-routes', () => {
  const harness = installClientContentRouteHarness({ unset })

  describe('rss-feeds client routes', () => {
    it('createSource creates a source', async () => {
      const rssFeedUrlId = crypto.randomUUID()
      const rssFeedUrl = `https://feed-create-${rssFeedUrlId}.example.com/feed.xml`
      const result = await harness.withClientRuntime(
        () =>
          clientRoutes.createSource({
            rss_feed_url: rssFeedUrl,
            follow: false,
          }),
        harness.adminCookieHeader,
      )
      expect(result).toMatchObject({
        status: 'created',
        rss_feed_id: expect.any(String),
        topic_id: expect.any(String),
        topic_slug: expect.any(String),
      })
      const persisted = await serverRoutes.serverApi.get<RssFeedResponseBody>(
        `/api/v1/rss-feeds/${result.rss_feed_id}`,
      )
      expect(persisted.rss_feed).toMatchObject({
        id: result.rss_feed_id,
        rss_feed_url: { url: rssFeedUrl },
        topic: { id: result.topic_id, slug: result.topic_slug },
      })
    })

    it('updateRssFeed returns the updated feed', async () => {
      const result = await harness.withClientRuntime(
        () => clientRoutes.updateRssFeed(harness.rssFeedId, { title: 'Updated Title' }),
        harness.adminCookieHeader,
      )
      expect(result.rss_feed).toMatchObject({ id: harness.rssFeedId, title: 'Updated Title' })
    })

    it('getRssFeedCrawls returns the feed crawl', async () => {
      const crawlId = await insertTestRssFeedCrawl({
        rssFeedId: harness.rssFeedId,
        responseCode: 204,
      })
      const result = await harness.withClientRuntime(
        () => clientRoutes.getRssFeedCrawls(harness.rssFeedId),
        harness.adminCookieHeader,
      )
      expect(result.results).toContainEqual(
        expect.objectContaining({ id: crawlId, response_code: 204 }),
      )
    })

    it('refreshRssFeed enqueues a fetch for the requested feed', async () => {
      const result = await harness.withClientRuntime(
        () => clientRoutes.refreshRssFeed(harness.rssFeedId, {}),
        harness.adminCookieHeader,
      )
      expect(result).toMatchObject({
        success: true,
        rss_feed_id: harness.rssFeedId,
        force: false,
      })
      const jobs = await rss_feeds.searchJobs({ data: { rssFeedId: harness.rssFeedId } })
      expect(jobs).toContainEqual(
        expect.objectContaining({
          name: 'fetchRssFeed',
          data: expect.objectContaining({ rssFeedId: harness.rssFeedId, ttl: 60_000 }),
        }),
      )
    })

    it('deleteRssFeed removes the feed', async () => {
      const feed = await insertTestRssFeedDirect({})
      await harness.withClientRuntime(
        () => clientRoutes.deleteRssFeed(feed.id),
        harness.adminCookieHeader,
      )

      await expect(
        serverRoutes.serverApi.get(`/api/v1/rss-feeds/${feed.id}`),
      ).rejects.toMatchObject({ status: 404 })
    })
  })
})
