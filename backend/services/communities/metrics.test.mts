import { it, expect, beforeAll, describe } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityListItem,
  insertTestProxyFollowCommunity,
  insertTestProxyMuteCommunity,
  insertTestTopic,
  createRandomString,
} from '@voucha/test-helpers'
import { getCommunityMetrics } from './metrics.mts'
import type { PrivateUser } from '@services/users/types'

describe('metrics', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  describe('getCommunityMetrics', () => {
    it('returns null for non-existent community', async () => {
      const result = await getCommunityMetrics('00000000-0000-0000-0000-000000000000')
      expect(result).toBeNull()
    })

    it('returns zero counts for a brand-new community', async () => {
      const community = await insertTestCommunity({ createdById: user.id })
      const metrics = await getCommunityMetrics(community.id)

      expect(metrics).not.toBeNull()
      expect(metrics!.__entity_type).toBe('community_metrics')
      expect(metrics!.id).toBe(community.id)
      expect(metrics!.member_count).toBe(0)
      expect(metrics!.post_count).toBe(0)
      expect(metrics!.list_item_count).toBe(0)
      expect(metrics!.proxy_follow_count).toBe(0)
      expect(metrics!.proxy_mute_count).toBe(0)
      expect(metrics!.virtual_subscription_count).toBe(0)
    })

    it('counts members correctly', async () => {
      const community = await insertTestCommunity({ createdById: user.id })
      const [member1, member2] = await Promise.all([createTestUser(), createTestUser()])

      await Promise.all([
        insertTestCommunityMember({ communityId: community.id, userId: member1!.id }),
        insertTestCommunityMember({ communityId: community.id, userId: member2!.id }),
      ])

      const metrics = await getCommunityMetrics(community.id)
      expect(metrics!.member_count).toBeGreaterThanOrEqual(2)
    })

    it('counts list items correctly', async () => {
      const rand = createRandomString(8)
      const community = await insertTestCommunity({ createdById: user.id })
      const topicId = await insertTestTopic({
        name: `Metrics Topic ${rand}`,
        slug: `metrics-topic-${rand}`,
        createdById: user.id,
      })

      await insertTestCommunityListItem({
        communityId: community.id,
        itemType: 'topic',
        entityId: topicId,
      })

      const metrics = await getCommunityMetrics(community.id)
      expect(metrics!.list_item_count).toBeGreaterThanOrEqual(1)
    })

    it('counts proxy follows and mutes correctly', async () => {
      const community = await insertTestCommunity({ createdById: user.id })
      const [follower, muter] = await Promise.all([createTestUser(), createTestUser()])

      await Promise.all([
        insertTestProxyFollowCommunity(follower!.id, community.id),
        insertTestProxyMuteCommunity(muter!.id, community.id),
      ])

      const metrics = await getCommunityMetrics(community.id)
      expect(metrics!.proxy_follow_count).toBeGreaterThanOrEqual(1)
      expect(metrics!.proxy_mute_count).toBeGreaterThanOrEqual(1)
      expect(metrics!.virtual_subscription_count).toBe(
        metrics!.proxy_follow_count + metrics!.proxy_mute_count,
      )
    })
  })
})
