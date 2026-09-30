import { describe, expect, it } from 'vitest'

import * as clientRoutes from '@/lib/api/client'
import * as serverRoutes from '@/lib/api/server'
import { insertTestRssFeedDirect } from '../../../../backend/test-helpers/index.mts'
import { installClientContentRouteHarness } from '../../../test-helpers/client-content-route-harness.mts'

function unset(target: object, key: string) {
  delete (target as Record<string, unknown>)[key]
}

describe('client-content-routes', () => {
  const harness = installClientContentRouteHarness({ unset })

  describe('rss-feeds client routes', () => {
    it('createSource creates a source', async () => {
      const rssFeedUrlId = crypto.randomUUID()
      const result = await harness.withClientRuntime(
        () =>
          clientRoutes.createSource({
            rss_feed_url: `https://feed-create-${rssFeedUrlId}.example.com/feed.xml`,
            follow: false,
          }),
        harness.adminCookieHeader,
      )
      expect(result).toBeDefined()
    })

    it('updateRssFeed returns 200', async () => {
      const result = await harness.withClientRuntime(
        () => clientRoutes.updateRssFeed(harness.rssFeedId, { title: 'Updated Title' }),
        harness.adminCookieHeader,
      )
      expect(result).toBeDefined()
    })

    it('getRssFeedCrawls returns 200', async () => {
      const result = await harness.withClientRuntime(
        () => clientRoutes.getRssFeedCrawls(harness.rssFeedId),
        harness.adminCookieHeader,
      )
      expect(result).toBeDefined()
    })

    it('refreshRssFeed returns 200', async () => {
      const result = await harness.withClientRuntime(
        () => clientRoutes.refreshRssFeed(harness.rssFeedId, {}),
        harness.adminCookieHeader,
      )
      expect(result).toBeDefined()
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
