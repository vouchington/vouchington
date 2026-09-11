import { describe, it, expect, beforeAll } from 'vitest'
import {
  archiveTestCommunity,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityListItem,
  insertTestCommunityPostReview,
  insertTestPost,
  insertTestTopic,
  createRandomString,
  createTestPost,
  archivePostForTopHashtagTest,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'
import { searchCommunityListItems, getCommunityListItemCounts } from './get.mts'
import { removeCommunityListItem } from './remove.mts'
import { communityListItemStorageCatalog } from './catalog.mts'

describe('get', () => {
  let owner: PrivateUser
  let community: Community

  beforeAll(async () => {
    owner = await createTestUser()
    community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  })

  describe('searchCommunityListItems', () => {
    it('returns empty results for a new community', async () => {
      expect(communityListItemStorageCatalog.topic.table).toBe('community_list_items__topics')
      const emptyCommunity = await insertTestCommunity({ createdById: owner.id })
      const result = await searchCommunityListItems(emptyCommunity.id, 'topic')
      expect(result.results).toHaveLength(0)
      expect(result.page_info.has_next_page).toBe(false)
      expect(result.page_info.start_cursor).toBeNull()
      expect(result.page_info.end_cursor).toBeNull()
    })

    it('returns list items for a community with topics', async () => {
      const random = createRandomString(8)
      const topicCommunity = await insertTestCommunity({ createdById: owner.id })
      const topicId = await insertTestTopic({
        name: `Test Topic ${random}`,
        slug: `test-topic-${random}`,
        createdById: owner.id,
      })
      await insertTestCommunityListItem({
        communityId: topicCommunity.id,
        itemType: 'topic',
        entityId: topicId,
        addedById: owner.id,
      })

      const result = await searchCommunityListItems(topicCommunity.id, 'topic')
      expect(result.results.length).toBeGreaterThanOrEqual(1)

      const item = result.results.find(r => r.entity_id === topicId)
      expect(item).toBeDefined()
      expect(item!.__entity_type).toBe('community_list_item')
      expect(item!.item_type).toBe('topic')
      expect(item!.community_id).toBe(topicCommunity.id)
      expect(item!.added_by_id).toBe(owner.id)
    })

    it('does not return removed items', async () => {
      const random = createRandomString(8)
      const topicCommunity = await insertTestCommunity({ createdById: owner.id })
      const topicId = await insertTestTopic({
        name: `Removed Topic ${random}`,
        slug: `removed-topic-${random}`,
        createdById: owner.id,
      })

      const item = await insertTestCommunityListItem({
        communityId: topicCommunity.id,
        itemType: 'topic',
        entityId: topicId,
      })

      await removeCommunityListItem(owner.id, topicCommunity.id, item.id, 'topic')

      const result = await searchCommunityListItems(topicCommunity.id, 'topic')
      const found = result.results.find(r => r.id === item.id)
      expect(found).toBeUndefined()
    })

    it('paginates results with cursor', async () => {
      const random = createRandomString(8)
      const paginationCommunity = await insertTestCommunity({ createdById: owner.id })
      const topicIds = await Promise.all(
        Array.from({ length: 3 }, (_, i) =>
          insertTestTopic({
            name: `Pagination Topic ${random} ${i}`,
            slug: `pagination-topic-${random}-${i}`,
            createdById: owner.id,
          }),
        ),
      )

      await Promise.all(
        topicIds.map(topicId =>
          insertTestCommunityListItem({
            communityId: paginationCommunity.id,
            itemType: 'topic',
            entityId: topicId,
          }),
        ),
      )

      const page1 = await searchCommunityListItems(paginationCommunity.id, 'topic', { limit: 2 })
      expect(page1.results.length).toBe(2)
      expect(page1.page_info.has_next_page).toBe(true)
      expect(page1.page_info.end_cursor).not.toBeNull()

      const page2 = await searchCommunityListItems(paginationCommunity.id, 'topic', {
        limit: 2,
        after: page1.page_info.end_cursor!,
      })
      expect(page2.results.length).toBeGreaterThanOrEqual(1)

      // No overlap between pages
      const page1Ids = new Set(page1.results.map(r => r.id))
      for (const item of page2.results) {
        expect(page1Ids.has(item.id)).toBe(false)
      }
    })

    it('filters ineligible posts before applying the page limit', async () => {
      const listCommunity = await insertTestCommunity({ createdById: owner.id })
      const archivedPost = await createTestPost({ user: owner })
      const visiblePost = await createTestPost({ user: owner })
      await archivePostForTopHashtagTest(archivedPost.id, owner.id)
      await insertTestCommunityListItem({
        communityId: listCommunity.id,
        itemType: 'post',
        entityId: archivedPost.id,
      })
      await insertTestCommunityListItem({
        communityId: listCommunity.id,
        itemType: 'post',
        entityId: visiblePost.id,
      })

      const result = await searchCommunityListItems(listCommunity.id, 'post', { limit: 1 })

      expect(result.results.map(item => item.entity_id)).toEqual([visiblePost.id])
      expect(result.page_info.has_next_page).toBe(false)
    })
  })

  describe('getCommunityListItemCounts', () => {
    it('returns zero counts for a new community', async () => {
      expect(Object.keys(communityListItemStorageCatalog)).toEqual([
        'topic',
        'rss_feed',
        'post',
        'url_hostname',
        'url',
      ])
      const emptyCommunity = await insertTestCommunity({ createdById: owner.id })
      const counts = await getCommunityListItemCounts(emptyCommunity.id)
      expect(counts.topic).toBe(0)
      expect(counts.rss_feed).toBe(0)
      expect(counts.post).toBe(0)
      expect(counts.url_hostname).toBe(0)
      expect(counts.url).toBe(0)
    })

    it('returns correct counts after adding items', async () => {
      const random = createRandomString(8)
      const countCommunity = await insertTestCommunity({ createdById: owner.id })
      const topicId = await insertTestTopic({
        name: `Count Topic ${random}`,
        slug: `count-topic-${random}`,
        createdById: owner.id,
      })
      await insertTestCommunityListItem({
        communityId: countCommunity.id,
        itemType: 'topic',
        entityId: topicId,
      })

      const counts = await getCommunityListItemCounts(countCommunity.id)
      expect(counts.topic).toBe(1)
      expect(counts.rss_feed).toBe(0)
    })

    it('keeps post counts consistent with anonymous and viewer list eligibility', async () => {
      const listCommunity = await insertTestCommunity({ createdById: owner.id })
      const privatePost = await createTestPost({
        user: owner,
        privacy: 'private',
        broadcast: 'followers',
      })
      await insertTestCommunityListItem({
        communityId: listCommunity.id,
        itemType: 'post',
        entityId: privatePost.id,
      })

      const [anonymousList, anonymousCounts, ownerList, ownerCounts] = await Promise.all([
        searchCommunityListItems(listCommunity.id, 'post'),
        getCommunityListItemCounts(listCommunity.id),
        searchCommunityListItems(listCommunity.id, 'post', { currentUser: owner }),
        getCommunityListItemCounts(listCommunity.id, { currentUser: owner }),
      ])

      expect(anonymousList.results).toHaveLength(0)
      expect(anonymousCounts.post).toBe(0)
      expect(ownerList.results.map(item => item.entity_id)).toEqual([privatePost.id])
      expect(ownerCounts.post).toBe(1)
    })

    it('keeps archived-community post rows and counts readable', async () => {
      const archivedCommunity = await insertTestCommunity({ createdById: owner.id })
      const postId = await insertTestPost({
        communityId: archivedCommunity.id,
        createdById: owner.id,
        markdown: 'archived list content',
        slug: `archived-list-${createRandomString(8)}`,
        title: 'Archived list content',
      })
      await insertTestCommunityPostReview({
        communityId: archivedCommunity.id,
        postId,
        submittedById: owner.id,
      })
      await insertTestCommunityListItem({
        communityId: archivedCommunity.id,
        entityId: postId,
        itemType: 'post',
      })
      await archiveTestCommunity({
        archivedById: owner.id,
        communityId: archivedCommunity.id,
      })

      const [items, counts] = await Promise.all([
        searchCommunityListItems(archivedCommunity.id, 'post'),
        getCommunityListItemCounts(archivedCommunity.id),
      ])
      expect(items.results.map(item => item.entity_id)).toEqual([postId])
      expect(counts.post).toBe(1)
    })
  })
})
