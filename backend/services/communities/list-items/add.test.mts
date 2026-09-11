import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityListItem,
  insertTestTopic,
  insertTestRssFeed,
  createRandomString,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'
import { updateRssFeedById } from '@services/rss-feeds/update'
import { addCommunityListItem } from './add.mts'
import { getCommunityListItemStorageConfig } from './catalog.mts'

describe('add', () => {
  let owner: PrivateUser
  let community: Community

  beforeAll(async () => {
    owner = await createTestUser()
    community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  })

  describe('addCommunityListItem', () => {
    it('adds a topic to the community list', async () => {
      expect(getCommunityListItemStorageConfig('topic').entityColumn).toBe('topic_id')
      const random = createRandomString(8)
      const topicId = await insertTestTopic({
        name: `Add Topic ${random}`,
        slug: `add-topic-${random}`,
        createdById: owner.id,
      })

      const item = await addCommunityListItem(owner.id, community.id, 'topic', topicId)

      expect(item.__entity_type).toBe('community_list_item')
      expect(item.item_type).toBe('topic')
      expect(item.entity_id).toBe(topicId)
      expect(item.community_id).toBe(community.id)
      expect(item.added_by_id).toBe(owner.id)
      expect(item.id).toBeTruthy()
      expect(item.created_at).toBeInstanceOf(Date)
    })

    it('throws 404 when entity does not exist', async () => {
      const fakeId = randomUUID()
      await expect(
        addCommunityListItem(owner.id, community.id, 'topic', fakeId),
      ).rejects.toMatchObject({ status: 404 })
    })

    it('throws on duplicate active item', async () => {
      const random = createRandomString(8)
      const topicId = await insertTestTopic({
        name: `Dup Topic ${random}`,
        slug: `dup-topic-${random}`,
        createdById: owner.id,
      })
      await insertTestCommunityListItem({
        communityId: community.id,
        itemType: 'topic',
        entityId: topicId,
      })

      // Duplicate insert should throw a unique constraint violation
      await expect(addCommunityListItem(owner.id, community.id, 'topic', topicId)).rejects.toThrow(
        Error,
      )
    })

    it('adds an rss_feed to the community list', async () => {
      expect(getCommunityListItemStorageConfig('rss_feed').activeEntityFilter).toContain('enabled')
      const random = createRandomString(8)
      const rssTopic = await insertTestTopic({
        name: `RSS Feed Topic ${random}`,
        slug: `rss-feed-topic-${random}`,
        createdById: owner.id,
      })
      const feedId = await insertTestRssFeed({
        topicId: rssTopic,
        title: `Test Feed ${random}`,
      })

      const item = await addCommunityListItem(owner.id, community.id, 'rss_feed', feedId)

      expect(item.item_type).toBe('rss_feed')
      expect(item.entity_id).toBe(feedId)
    })

    it('throws 404 when adding a disabled rss_feed', async () => {
      const random = createRandomString(8)
      const rssTopic = await insertTestTopic({
        name: `Disabled RSS Feed Topic ${random}`,
        slug: `disabled-rss-feed-topic-${random}`,
        createdById: owner.id,
      })
      const feedId = await insertTestRssFeed({
        topicId: rssTopic,
        title: `Disabled Test Feed ${random}`,
      })
      await updateRssFeedById(feedId, { enabled: false })

      await expect(
        addCommunityListItem(owner.id, community.id, 'rss_feed', feedId),
      ).rejects.toMatchObject({ status: 404 })
    })
  })
})
