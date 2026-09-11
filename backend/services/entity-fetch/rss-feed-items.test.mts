import { it, expect, describe, beforeAll } from 'vitest'
import { createHash } from 'node:crypto'
import { fetchRssFeedItemsWithMetadata } from './rss-feed-items.mts'
import {
  createTestUser,
  insertTestTopic,
  insertTestRssFeed,
  insertTestRssFeedItem,
  insertRssFeedItemVote,
} from '@voucha/test-helpers'
import { bookmarkEntity } from '@services/bookmarks/upsert'
import { addUrl } from '@services/urls/upsert'
import type { PrivateUser } from '@services/users/types'

describe('rss-feed-items', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  describe('fetchRssFeedItemsWithMetadata', () => {
    it('returns empty objects for empty ids', async () => {
      const result = await fetchRssFeedItemsWithMetadata([])

      expect(result.entities).toEqual({})
      expect(result.entity_metrics).toEqual({})
      expect(result.bookmarks).toBeUndefined()
      expect(result.election_votes).toBeUndefined()
    })

    it('returns indexed entities', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const topicId = await insertTestTopic({
        name: `Topic ${random}`,
        slug: `topic-${random}`,
        createdById: user.id,
      })
      const rssFeedId = await insertTestRssFeed({
        topicId,
        title: `RSS ${random}`,
      })
      const url = await addUrl(null, `https://example.com/${random}`, {
        content_type: 'text/html',
      })
      const contentSha256 = createHash('sha256').update(random).digest()
      const rssFeedItemId = await insertTestRssFeedItem({
        rssFeedId,
        urlId: url!.id,
        guid: `guid-${random}`,
        itemData: { title: `Item ${random}` },
        contentSha256,
      })

      const result = await fetchRssFeedItemsWithMetadata([rssFeedItemId])

      expect(result.entities[rssFeedItemId]).toBeDefined()
      expect(result.entity_metrics).toEqual({})
    })

    it('includes bookmarks and election votes when authenticated', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const topicId = await insertTestTopic({
        name: `Topic ${random}`,
        slug: `topic-${random}`,
        createdById: user.id,
      })
      const rssFeedId = await insertTestRssFeed({
        topicId,
        title: `RSS ${random}`,
      })
      const url = await addUrl(null, `https://example.com/${random}`, {
        content_type: 'text/html',
      })
      const contentSha256 = createHash('sha256').update(random).digest()
      const rssFeedItemId = await insertTestRssFeedItem({
        rssFeedId,
        urlId: url!.id,
        guid: `guid-${random}`,
        itemData: { title: `Item ${random}` },
        contentSha256,
      })

      await bookmarkEntity(user, 'rss_feed_item', { id: rssFeedItemId }, 'save')
      await insertRssFeedItemVote(user.id, rssFeedItemId, 1, undefined, false, true)

      const result = await fetchRssFeedItemsWithMetadata([rssFeedItemId], user)

      expect(result.bookmarks).toBeDefined()
      expect(result.bookmarks![rssFeedItemId].save).toBe(true)
      expect(result.election_votes).toBeDefined()
      expect(result.election_votes![rssFeedItemId]).toBeDefined()
      expect(result.election_votes![rssFeedItemId].choice).toBe('like')
    })
  })
})
