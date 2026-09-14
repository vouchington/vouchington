import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestStory,
  insertTestRssFeedItem,
  createTestUrlWithHostname,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import type { PrivateUser } from '@services/users/types'
import { createHash } from 'node:crypto'

describe('story', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  function sha256(data: unknown): Buffer {
    return createHash('sha256').update(JSON.stringify(data)).digest()
  }

  describe('GET /api/v1/stories/:id', () => {
    it('returns 400 for invalid UUID', async () => {
      const request = createRequest()
      await request.get('/api/v1/stories/not-a-uuid').expect(400)
    })

    it('returns 404 for unknown story', async () => {
      const request = createRequest()
      await request.get('/api/v1/stories/00000000-0000-0000-0000-000000000001').expect(404)
    })

    it('returns story with item_ids for authenticated user', async () => {
      const story = await insertTestStory({ title: 'Story API Test' })
      const feed = await createTestRssFeed({})
      const urlId = await createTestUrlWithHostname()
      const random = Math.random().toString(36).slice(2, 10)
      const itemData = { title: `Item ${random}`, link: `https://example.com/${random}` }
      const itemId = await insertTestRssFeedItem({
        rssFeedId: feed.id,
        urlId,
        guid: `story-api-test-${random}`,
        itemData,
        contentSha256: sha256(itemData),
      })
      await setTestItemStoryId(itemId, story.id)

      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request.get(`/api/v1/stories/${story.id}`).expect(200)

      expect(response.body.story).toBeDefined()
      expect(response.body.story.id).toBe(story.id)
      expect(response.body.story.title).toBe('Story API Test')
      expect(response.body.item_ids).toContain(itemId)
      expect(response.body.rss_feed_items).toBeDefined()
      expect(response.body.rss_feed_item_embeds[itemId]).toMatchObject({
        source_url: response.body.rss_feed_items[itemId].url.url,
      })
    })

    it('returns 200 with cache headers for unauthenticated request', async () => {
      const story = await insertTestStory({ title: 'Public Story Test' })

      const request = createRequest()
      const response = await request.get(`/api/v1/stories/${story.id}`).expect(200)

      expect(response.headers['cache-control']).toBeDefined()
      expect(response.body.story.id).toBe(story.id)
    })
  })
})
