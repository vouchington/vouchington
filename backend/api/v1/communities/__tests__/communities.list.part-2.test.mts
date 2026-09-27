import { describe, it, expect, beforeAll } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  removeTestCommunityMember,
  insertTestCommunityListItem,
  insertTestProxyFollowCommunity,
  insertTestTopic,
  createRandomString,
} from '@voucha/test-helpers'

import type { PrivateUser } from '@services/users/types'

describe('communities', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  describe('Communities List Routes', () => {
    describe('GET /api/v1/communities', () => {
      it('subscribes to proxy follows count in community_metrics', async () => {
        const random = createRandomString(8)
        const community = await insertTestCommunity({
          createdById: user.id,
          name: `Proxy Follow Test ${random}`,
          slug: `proxy-follow-test-${random}`,
        })
        const follower = await createTestUser()
        await insertTestProxyFollowCommunity(follower.id, community.id)

        const request = createRequest()
        const response = await request
          .get(`/api/v1/communities?sort=virtual_subscriptions&q=${random}`)
          .expect(200)

        const metrics = response.body.community_metrics?.[community.id]
        expect(metrics).toBeDefined()
        expect(metrics.proxy_follow_count).toBeGreaterThanOrEqual(1)
        expect(metrics.virtual_subscription_count).toBeGreaterThanOrEqual(1)
      })

      it('does not return private communities to unauthenticated users', async () => {
        const random = createRandomString(8)
        const [publicCommunity, privateCommunity] = await Promise.all([
          insertTestCommunity({
            createdById: user.id,
            name: `Public ${random}`,
            slug: `public-${random}`,
            visibility: 'public',
          }),
          insertTestCommunity({
            createdById: user.id,
            name: `Private ${random}`,
            slug: `private-${random}`,
            visibility: 'private',
          }),
        ])

        const request = createRequest()
        const response = await request.get(`/api/v1/communities?q=${random}`).expect(200)

        const ids = response.body.results.map((r: { id: string }) => r.id)
        expect(ids).toContain(publicCommunity.id)
        expect(ids).not.toContain(privateCommunity.id)
      })

      it('does not return private communities to authenticated non-members', async () => {
        const random = createRandomString(8)
        const nonMember = await createTestUser()
        const [publicCommunity, privateCommunity] = await Promise.all([
          insertTestCommunity({
            createdById: user.id,
            name: `PubNonMember ${random}`,
            slug: `pub-nonmember-${random}`,
            visibility: 'public',
          }),
          insertTestCommunity({
            createdById: user.id,
            name: `PrivNonMember ${random}`,
            slug: `priv-nonmember-${random}`,
            visibility: 'private',
          }),
        ])

        const request = createRequest()
        await request.authenticateAs(nonMember)
        const response = await request.get(`/api/v1/communities?q=${random}`).expect(200)

        const ids = response.body.results.map((r: { id: string }) => r.id)
        expect(ids).toContain(publicCommunity.id)
        expect(ids).not.toContain(privateCommunity.id)
      })

      it('returns private communities the authenticated user is a member of', async () => {
        const random = createRandomString(8)
        const memberUser = await createTestUser()
        const privateCommunity = await insertTestCommunity({
          createdById: user.id,
          name: `PrivMember ${random}`,
          slug: `priv-member-${random}`,
          visibility: 'private',
        })
        await insertTestCommunityMember({ communityId: privateCommunity.id, userId: memberUser.id })

        const request = createRequest()
        await request.authenticateAs(memberUser)
        const response = await request.get(`/api/v1/communities?q=${random}`).expect(200)

        const ids = response.body.results.map((r: { id: string }) => r.id)
        expect(ids).toContain(privateCommunity.id)
      })

      it('returns private communities to administrators', async () => {
        const random = createRandomString(8)
        const adminUser = await createTestUser({ administrator: true })
        const privateCommunity = await insertTestCommunity({
          createdById: user.id,
          name: `PrivAdmin ${random}`,
          slug: `priv-admin-${random}`,
          visibility: 'private',
        })

        const request = createRequest()
        await request.authenticateAs(adminUser)
        const response = await request.get(`/api/v1/communities?q=${random}`).expect(200)

        const ids = response.body.results.map((r: { id: string }) => r.id)
        expect(ids).toContain(privateCommunity.id)
      })

      it('requires authentication for eligible_post_type filtering', async () => {
        const request = createRequest()
        await request.get('/api/v1/communities?eligible_post_type=discussion').expect(401)
      })

      it('rejects invalid eligible_post_type values', async () => {
        const request = createRequest()
        await request.authenticateAs(user)
        await request.get('/api/v1/communities?eligible_post_type=story').expect(400)
      })

      it('returns 400 for invalid list_scope param', async () => {
        const request = createRequest()
        await request.get('/api/v1/communities?list_scope=invalid').expect(400)
      })

      it('returns 400 for invalid feed_category param', async () => {
        const request = createRequest()
        await request.get('/api/v1/communities?feed_category=invalid').expect(400)
      })

      it('filters eligible discussion communities to active memberships', async () => {
        const random = createRandomString(8)
        const [joinedCommunity, removedCommunity, nonMemberCommunity] = await Promise.all([
          insertTestCommunity({
            createdById: user.id,
            name: `Joined Discussion ${random}`,
            slug: `joined-discussion-${random}`,
          }),
          insertTestCommunity({
            createdById: user.id,
            name: `Removed Discussion ${random}`,
            slug: `removed-discussion-${random}`,
          }),
          insertTestCommunity({
            createdById: user.id,
            name: `Non Member Discussion ${random}`,
            slug: `non-member-discussion-${random}`,
          }),
        ])
        await insertTestCommunityMember({ communityId: joinedCommunity.id, userId: user.id })
        await insertTestCommunityMember({ communityId: removedCommunity.id, userId: user.id })
        await removeTestCommunityMember(removedCommunity.id, user.id)

        const request = createRequest()
        await request.authenticateAs(user)
        const response = await request
          .get(`/api/v1/communities?eligible_post_type=discussion&q=${random}`)
          .expect(200)

        const ids = response.body.results.map((r: { id: string }) => r.id)
        expect(ids).toContain(joinedCommunity.id)
        expect(ids).not.toContain(removedCommunity.id)
        expect(ids).not.toContain(nonMemberCommunity.id)
      })

      it('includes eligible communities for administrators without membership', async () => {
        const random = createRandomString(8)
        const adminUser = await createTestUser({ administrator: true })
        const reviewCommunity = await insertTestCommunity({
          createdById: user.id,
          name: `Admin Review Eligible ${random}`,
          slug: `admin-review-eligible-${random}`,
          allow_review_posts: true,
        })

        const request = createRequest()
        await request.authenticateAs(adminUser)
        const response = await request
          .get(`/api/v1/communities?eligible_post_type=review&q=${random}`)
          .expect(200)

        const ids = response.body.results.map((r: { id: string }) => r.id)
        expect(ids).toContain(reviewCommunity.id)
      })

      it('filters eligible review and data point communities by post-type flags', async () => {
        const random = createRandomString(8)
        const [reviewCommunity, dataPointCommunity, disabledCommunity] = await Promise.all([
          insertTestCommunity({
            createdById: user.id,
            name: `Review Enabled ${random}`,
            slug: `review-enabled-${random}`,
            allow_review_posts: true,
          }),
          insertTestCommunity({
            createdById: user.id,
            name: `Data Point Enabled ${random}`,
            slug: `data-point-enabled-${random}`,
            allow_data_point_posts: true,
          }),
          insertTestCommunity({
            createdById: user.id,
            name: `Root Only ${random}`,
            slug: `root-only-${random}`,
          }),
        ])
        await Promise.all([
          insertTestCommunityMember({ communityId: reviewCommunity.id, userId: user.id }),
          insertTestCommunityMember({ communityId: dataPointCommunity.id, userId: user.id }),
          insertTestCommunityMember({ communityId: disabledCommunity.id, userId: user.id }),
        ])

        const request = createRequest()
        await request.authenticateAs(user)
        const reviewResponse = await request
          .get(`/api/v1/communities?eligible_post_type=review&q=${random}`)
          .expect(200)
        const dataPointResponse = await request
          .get(`/api/v1/communities?eligible_post_type=data_point&q=${random}`)
          .expect(200)

        const reviewIds = reviewResponse.body.results.map((r: { id: string }) => r.id)
        const dataPointIds = dataPointResponse.body.results.map((r: { id: string }) => r.id)
        expect(reviewIds).toContain(reviewCommunity.id)
        expect(reviewIds).not.toContain(dataPointCommunity.id)
        expect(reviewIds).not.toContain(disabledCommunity.id)
        expect(dataPointIds).toContain(dataPointCommunity.id)
        expect(dataPointIds).not.toContain(reviewCommunity.id)
        expect(dataPointIds).not.toContain(disabledCommunity.id)
      })
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof insertTestCommunityListItem)
  void (0 as unknown as typeof insertTestTopic)
})
