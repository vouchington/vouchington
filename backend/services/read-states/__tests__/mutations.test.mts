import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  createRandomString,
  insertTestTopic,
  insertTestRssFeed,
  createTestRssFeedItemWithUrl,
  insertTestPost,
  readStateExists,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { markRead, markUnread } from '../mutations.mts'
import type { ReadStateEntityType } from '../types.mts'

describe('read-state mutations', () => {
  let user: PrivateUser
  let rssFeedItemId: string
  let postId: string

  beforeAll(async () => {
    user = await createTestUser()
    const topicId = await insertTestTopic({
      name: `Read State Topic ${createRandomString(8)}`,
      slug: `read-state-topic-${createRandomString(8)}`,
      createdById: user.id,
    })
    const feedId = await insertTestRssFeed({
      topicId,
      title: `Read State Feed ${createRandomString(8)}`,
    })
    const item = await createTestRssFeedItemWithUrl(feedId)
    rssFeedItemId = item.id
    postId = await insertTestPost({
      title: `Read State Post ${createRandomString(8)}`,
      slug: `read-state-post-${createRandomString(8)}`,
      createdById: user.id,
      markdown: 'test content',
    })
  })

  describe('markRead + markUnread (rss_feed_item)', () => {
    it('marks an rss_feed_item as read', async () => {
      await markRead(user.id, 'rss_feed_item', rssFeedItemId)
      expect(await readStateExists(user.id, 'rss_feed_item', rssFeedItemId)).toBe(true)
    })

    it('markRead is idempotent (ON CONFLICT DO NOTHING)', async () => {
      await markRead(user.id, 'rss_feed_item', rssFeedItemId)
      await markRead(user.id, 'rss_feed_item', rssFeedItemId)
      expect(await readStateExists(user.id, 'rss_feed_item', rssFeedItemId)).toBe(true)
    })

    it('marks an rss_feed_item as unread', async () => {
      await markRead(user.id, 'rss_feed_item', rssFeedItemId)
      await markUnread(user.id, 'rss_feed_item', rssFeedItemId)
      expect(await readStateExists(user.id, 'rss_feed_item', rssFeedItemId)).toBe(false)
    })

    it('markUnread is a no-op when no read state exists', async () => {
      await markUnread(user.id, 'rss_feed_item', rssFeedItemId)
      expect(await readStateExists(user.id, 'rss_feed_item', rssFeedItemId)).toBe(false)
    })
  })

  describe('markRead + markUnread (post)', () => {
    it('marks a post as read', async () => {
      await markRead(user.id, 'post', postId)
      expect(await readStateExists(user.id, 'post', postId)).toBe(true)
    })

    it('markRead is idempotent for posts', async () => {
      await markRead(user.id, 'post', postId)
      await markRead(user.id, 'post', postId)
      expect(await readStateExists(user.id, 'post', postId)).toBe(true)
    })

    it('marks a post as unread', async () => {
      await markRead(user.id, 'post', postId)
      await markUnread(user.id, 'post', postId)
      expect(await readStateExists(user.id, 'post', postId)).toBe(false)
    })

    it('markUnread is a no-op for posts when absent', async () => {
      await markUnread(user.id, 'post', postId)
      expect(await readStateExists(user.id, 'post', postId)).toBe(false)
    })
  })

  describe('unsupported entity types', () => {
    it('rejects markRead before issuing a query for an unsupported entity type', async () => {
      await expect(markRead(user.id, 'unsupported' as ReadStateEntityType, postId)).rejects.toThrow(
        'Unknown read state entity type: unsupported',
      )
    })

    it('rejects markUnread before issuing a query for an unsupported entity type', async () => {
      await expect(
        markUnread(user.id, 'unsupported' as ReadStateEntityType, postId),
      ).rejects.toThrow('Unknown read state entity type: unsupported')
    })
  })
})
