import { describe, expect, it } from 'vitest'

import * as clientRoutes from '@/lib/api/client'
import { exportRssFeeds, exportTopics, importRssFeeds } from '@/lib/api/client/import-export'
import {
  createTestRssFeedItemWithUrl,
  setTestItemStoryId,
} from '../../../../backend/test-helpers/index.mts'
import { installClientContentRouteHarness } from '../../../test-helpers/client-content-route-harness.mts'

function unset(target: object, key: string) {
  delete (target as Record<string, unknown>)[key]
}

describe('client-content-routes', () => {
  const harness = installClientContentRouteHarness({
    unset,
    afterStoryLinked: async () => {
      const secondItem = await createTestRssFeedItemWithUrl(harness.rssFeedId)
      await setTestItemStoryId(secondItem.id, harness.storyId)
    },
  })

  describe('import-export client routes', () => {
    it('importRssFeeds with urls returns 200', async () => {
      const rssFeedUrlId = crypto.randomUUID()
      const result = await harness.withClientRuntime(
        () =>
          importRssFeeds({
            urls: [`https://import-test-${rssFeedUrlId}.example.com/feed.xml`],
            follow: false,
          }),
        harness.adminCookieHeader,
      )
      expect(result).toBeDefined()
    })

    it('importRssFeeds with opml returns 200', async () => {
      const rssFeedUrlId = crypto.randomUUID()
      const opml = `<?xml version="1.0" encoding="UTF-8"?><opml version="1.0"><head><title>Test</title></head><body><outline type="rss" text="Test Feed" xmlUrl="https://opml-test-${rssFeedUrlId}.example.com/feed.xml"/></body></opml>`
      const result = await harness.withClientRuntime(
        () => importRssFeeds({ opml }),
        harness.adminCookieHeader,
      )
      expect(result).toBeDefined()
    })

    it('exportTopics returns 200', async () => {
      const response = await harness.withClientRuntime(
        () => fetch(exportTopics()),
        harness.adminCookieHeader,
      )
      expect(response.status).toBe(200)
      await response.body?.cancel()
    })

    it('exportRssFeeds returns XML text', async () => {
      const response = await harness.withClientRuntime(
        () => fetch(exportRssFeeds()),
        harness.adminCookieHeader,
      )
      expect(await response.text()).toContain('<opml')
    })
  })

  describe('stories client routes', () => {
    it('createStoryPostFromStory returns 200', async () => {
      const result = await harness.withClientRuntime(
        () => clientRoutes.createStoryPostFromStory(harness.storyId),
        harness.adminCookieHeader,
      )
      expect(result).toMatchObject({
        story: expect.objectContaining({ id: harness.storyId }),
        post: expect.objectContaining({ id: expect.any(String) }),
      })
    })

    it('createLinkPostFromRssFeedItem returns 200', async () => {
      const anotherItem = await createTestRssFeedItemWithUrl(harness.rssFeedId)
      const result = await harness.withClientRuntime(
        () => clientRoutes.createLinkPostFromRssFeedItem(anotherItem.id),
        harness.adminCookieHeader,
      )
      expect(result).toMatchObject({ post: expect.objectContaining({ title: anotherItem.title }) })
    })
  })
})
