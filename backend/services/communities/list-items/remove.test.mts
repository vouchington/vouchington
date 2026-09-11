import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityListItem,
  insertTestTopic,
  createRandomString,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'
import { removeCommunityListItem } from './remove.mts'
import { searchCommunityListItems } from './get.mts'
import { getCommunityListItemStorageConfig } from './catalog.mts'

describe('remove', () => {
  let owner: PrivateUser
  let community: Community

  beforeAll(async () => {
    owner = await createTestUser()
    community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  })

  describe('removeCommunityListItem', () => {
    it('soft-deletes an active item', async () => {
      expect(getCommunityListItemStorageConfig('topic').table).toBe('community_list_items__topics')
      const random = createRandomString(8)
      const topicId = await insertTestTopic({
        name: `Remove Topic ${random}`,
        slug: `remove-topic-${random}`,
        createdById: owner.id,
      })

      const item = await insertTestCommunityListItem({
        communityId: community.id,
        itemType: 'topic',
        entityId: topicId,
      })

      await removeCommunityListItem(owner.id, community.id, item.id, 'topic')

      // Item should no longer appear in active results
      const result = await searchCommunityListItems(community.id, 'topic')
      const found = result.results.find(r => r.id === item.id)
      expect(found).toBeUndefined()
    })

    it('throws 404 when item does not exist', async () => {
      const fakeId = randomUUID()
      await expect(
        removeCommunityListItem(owner.id, community.id, fakeId, 'topic'),
      ).rejects.toMatchObject({ status: 404 })
    })

    it('throws 404 when item belongs to a different community', async () => {
      const random = createRandomString(8)
      const otherCommunity = await insertTestCommunity({ createdById: owner.id })
      const topicId = await insertTestTopic({
        name: `Cross-community Topic ${random}`,
        slug: `cross-topic-${random}`,
        createdById: owner.id,
      })
      const item = await insertTestCommunityListItem({
        communityId: otherCommunity.id,
        itemType: 'topic',
        entityId: topicId,
      })

      await expect(
        removeCommunityListItem(owner.id, community.id, item.id, 'topic'),
      ).rejects.toMatchObject({ status: 404 })
    })

    it('throws 404 when item is already removed', async () => {
      const random = createRandomString(8)
      const topicId = await insertTestTopic({
        name: `Double Remove Topic ${random}`,
        slug: `double-remove-topic-${random}`,
        createdById: owner.id,
      })
      const item = await insertTestCommunityListItem({
        communityId: community.id,
        itemType: 'topic',
        entityId: topicId,
      })

      await removeCommunityListItem(owner.id, community.id, item.id, 'topic')

      // Second remove should 404
      await expect(
        removeCommunityListItem(owner.id, community.id, item.id, 'topic'),
      ).rejects.toMatchObject({ status: 404 })
    })
  })
})
