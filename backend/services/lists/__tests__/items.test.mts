import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  createRandomString,
  insertTestPost,
  insertTestTopic,
  createTestRssFeedItemWithUrl,
  insertTestRssFeed,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { createList } from '../lists.mts'
import { addListItem, removeListItem, searchListItems } from '../items.mts'
import { markRead } from '../../read-states/mutations.mts'

describe('items service', () => {
  let user: PrivateUser
  let listId: string
  let postId: string
  let rssFeedItemId: string

  beforeAll(async () => {
    user = await createTestUser()
    const list = await createList(user.id, { name: `Items Test ${createRandomString(8)}` })
    listId = list.id

    const topicId = await insertTestTopic({
      name: `Items Topic ${createRandomString(8)}`,
      slug: `items-topic-${createRandomString(8)}`,
      createdById: user.id,
    })
    postId = await insertTestPost({
      title: `Items Post ${createRandomString(8)}`,
      slug: `items-post-${createRandomString(8)}`,
      createdById: user.id,
      markdown: 'test content',
    })
    const feedId = await insertTestRssFeed({
      topicId,
      title: `Items Feed ${createRandomString(8)}`,
    })
    const item = await createTestRssFeedItemWithUrl(feedId)
    rssFeedItemId = item.id
  })

  describe('addListItem', () => {
    it('adds an rss_feed_item to a list', async () => {
      const item = await addListItem(listId, 'rss_feed_item', rssFeedItemId)
      expect(item.__entity_type).toBe('list_item')
      expect(item.list_id).toBe(listId)
      expect(item.item_type).toBe('rss_feed_item')
      expect(item.entity_id).toBe(rssFeedItemId)
    })

    it('is idempotent on duplicate add (returns existing row)', async () => {
      const listId2 = (await createList(user.id, { name: `Idempotent ${createRandomString(8)}` }))
        .id
      const item1 = await addListItem(listId2, 'post', postId)
      const item2 = await addListItem(listId2, 'post', postId)
      expect(item1.id).toBe(item2.id)
    })

    it('adds a post to a list', async () => {
      const item = await addListItem(listId, 'post', postId)
      expect(item.item_type).toBe('post')
      expect(item.entity_id).toBe(postId)
    })
  })

  describe('removeListItem', () => {
    it('removes an item from the list', async () => {
      const listId3 = (await createList(user.id, { name: `Remove Test ${createRandomString(8)}` }))
        .id
      await addListItem(listId3, 'post', postId)
      await removeListItem(listId3, 'post', postId)

      const { results } = await searchListItems(listId3)
      const found = results.find(i => i.entity_id === postId)
      expect(found).toBeUndefined()
    })

    it('throws 404 when item not found', async () => {
      await expect(
        removeListItem(listId, 'post', '00000000-0000-7000-8000-000000000000'),
      ).rejects.toMatchObject({ status: 404 })
    })
  })

  describe('searchListItems', () => {
    it('returns items for a list', async () => {
      const { results } = await searchListItems(listId)
      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    it('filters by mediaType (rss_feed_item media type)', async () => {
      // article is the default media_type for new rss_feed_items
      const { results } = await searchListItems(listId, { mediaType: 'article' })
      for (const item of results) {
        expect(item.media_type).toBe('article')
      }
    })

    it('returns page_info', async () => {
      const { page_info } = await searchListItems(listId)
      expect(page_info).toHaveProperty('has_next_page')
    })
  })

  describe('read filter', () => {
    beforeAll(async () => {
      // addListItem is idempotent (INSERT ... ON CONFLICT falls back to SELECT of the
      // existing row), so this is safe whether or not the 'addListItem' describe block above
      // already ran. Without it, running this describe block (or a single test inside it) via
      // a Vitest title filter skips those earlier tests, listId ends up with no items at all,
      // and every assertion below observes an empty result regardless of the read-state logic
      // under test.
      await addListItem(listId, 'rss_feed_item', rssFeedItemId)
      await addListItem(listId, 'post', postId)
    })

    it('returns only read items when read=true', async () => {
      await markRead(user.id, 'rss_feed_item', rssFeedItemId)
      const { results } = await searchListItems(listId, {
        read: true,
        currentUserId: user.id,
      })
      const ids = results.map(r => r.entity_id)
      expect(ids).toContain(rssFeedItemId)
      expect(ids).not.toContain(postId)
    })

    it('excludes read items when read=false', async () => {
      await markRead(user.id, 'rss_feed_item', rssFeedItemId)
      const { results } = await searchListItems(listId, {
        read: false,
        currentUserId: user.id,
      })
      const ids = results.map(r => r.entity_id)
      expect(ids).not.toContain(rssFeedItemId)
    })

    it('applies no filter when currentUserId is absent', async () => {
      // Mark rssFeedItemId read here (idempotent) rather than relying on an earlier test's
      // side effect, so this test's own read/unread precondition holds regardless of whether
      // the preceding tests in this describe block ran (e.g. under a Vitest title filter).
      // postId stays unread; without currentUserId the read/unread clause must not be
      // applied, so both items should still be returned.
      await markRead(user.id, 'rss_feed_item', rssFeedItemId)
      const { results } = await searchListItems(listId, { read: true })
      const ids = results.map(r => r.entity_id)
      expect(ids).toContain(rssFeedItemId)
      expect(ids).toContain(postId)
    })
  })
})
