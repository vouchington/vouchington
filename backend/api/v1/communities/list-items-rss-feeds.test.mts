import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
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

describe('list-items-rss-feeds', () => {
  let owner: PrivateUser
  let community: Community

  beforeAll(async () => {
    owner = await createTestUser()
    community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  })

  describe('GET /api/v1/communities/:slug/list-items/rss-feeds', () => {
    it('returns 200 with rss_feeds map', async () => {
      const random = createRandomString(8)
      const rssTopic = await insertTestTopic({
        name: `RSS Route Topic ${random}`,
        slug: `rss-route-topic-${random}`,
        createdById: owner.id,
      })
      const feedId = await insertTestRssFeed({
        topicId: rssTopic,
        title: `RSS Route Feed ${random}`,
      })
      await insertTestCommunityListItem({
        communityId: community.id,
        itemType: 'rss_feed',
        entityId: feedId,
      })

      const request = createRequest()
      const response = await request
        .get(`/api/v1/communities/${community.slug}/list-items/rss-feeds`)
        .expect(200)

      expect(response.body).toHaveProperty('rss_feeds')
      expect(Array.isArray(response.body.results)).toBe(true)
    })
  })
})
