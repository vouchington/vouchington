import { describe, it, expect, beforeAll } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  completeTestMediaDeliveryRecord,
  getTestImageSurfacePlacements,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityListItem,
  insertTestImage,
  insertTestProxyFollowCommunity,
  insertTestTopic,
  createRandomString,
  setTestCommunitySurfaceImages,
} from '@voucha/test-helpers'

import type { PrivateUser } from '@services/users/types'
import { stageImagePlacementDeliveryRecord } from '@services/media-delivery-safety'

describe('communities', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  describe('Communities List Routes', () => {
    describe('GET /api/v1/communities', () => {
      it('returns list with results and page_info', async () => {
        await insertTestCommunity({ createdById: user.id })

        const request = createRequest()
        const response = await request.get('/api/v1/communities').expect(200)

        expect(Array.isArray(response.body.results)).toBe(true)
        expect(response.body).toHaveProperty('page_info')
        expect(response.body).toHaveProperty('communities')
      })

      it('includes safe profile and banner placement tuples in community search results', async () => {
        const community = await insertTestCommunity({ createdById: user.id })
        const profileImageId = await insertTestImage(user.id)
        const bannerImageId = await insertTestImage(user.id)
        await setTestCommunitySurfaceImages(community.id, { profileImageId, bannerImageId })
        const placements = await getTestImageSurfacePlacements({ communityId: community.id })
        await Promise.all(
          placements.map(async placement => {
            const { deliveryKey } = await stageImagePlacementDeliveryRecord({
              placementId: placement.placement_id,
              revision: placement.placement_revision,
              imageId: placement.image_id,
              state: 'allow',
            })
            await completeTestMediaDeliveryRecord(deliveryKey)
          }),
        )

        const request = createRequest()
        const response = await request.get(`/api/v1/communities?q=${community.slug}`).expect(200)

        expect(response.body.communities[community.id]).toEqual(
          expect.objectContaining({
            profile_image_placement: expect.objectContaining({ image_id: profileImageId }),
            banner_image_placement: expect.objectContaining({ image_id: bannerImageId }),
          }),
        )
      })

      it('filters to current user communities when member_id=me', async () => {
        const otherUser = await createTestUser()
        const myCommunity = await insertTestCommunity({ createdById: user.id })
        const otherCommunity = await insertTestCommunity({ createdById: otherUser.id })
        await insertTestCommunityMember({ communityId: myCommunity.id, userId: user.id })

        const request = createRequest()
        await request.authenticateAs(user)
        const response = await request.get('/api/v1/communities?member_id=me').expect(200)

        const ids = response.body.results.map((r: { id: string }) => r.id)
        expect(ids).toContain(myCommunity.id)
        expect(ids).not.toContain(otherCommunity.id)
      })

      it('returns 401 for member_id=me without auth', async () => {
        const request = createRequest()
        await request.get('/api/v1/communities?member_id=me').expect(401)
      })

      it('filters by query string', async () => {
        const random = createRandomString(8)
        const name = `Unique Community ${random}`
        const slug = `unique-community-${random}`
        await insertTestCommunity({ createdById: user.id, name, slug })

        const request = createRequest()
        const response = await request.get(`/api/v1/communities?q=${random}`).expect(200)

        expect(Array.isArray(response.body.results)).toBe(true)
        const ids = response.body.results.map((r: { id: string }) => r.id)
        const found = Object.keys(response.body.communities ?? {}).some(id => ids.includes(id))
        expect(found).toBe(true)
      })

      it('returns 400 for invalid sort param', async () => {
        const request = createRequest()
        await request.get('/api/v1/communities?sort=invalid').expect(400)
      })

      it('response includes users map with owner info', async () => {
        const random = createRandomString(8)
        await insertTestCommunity({
          createdById: user.id,
          name: `Owner Info Test ${random}`,
          slug: `owner-info-test-${random}`,
        })

        const request = createRequest()
        const response = await request.get(`/api/v1/communities?q=${random}`).expect(200)

        expect(response.body).toHaveProperty('users')
        expect(typeof response.body.users).toBe('object')
        // The creating user should appear in the users map
        const ownerEntry = response.body.users[user.id]
        expect(ownerEntry).toBeDefined()
        expect(ownerEntry).toHaveProperty('id', user.id)
        expect(ownerEntry).toHaveProperty('username', user.username)
      })

      it('returns 400 for invalid list_type param', async () => {
        const request = createRequest()
        await request.get('/api/v1/communities?list_type=invalid').expect(400)
      })

      it('returns community_metrics when sort=members', async () => {
        const random = createRandomString(8)
        await insertTestCommunity({
          createdById: user.id,
          name: `${random} MetricsTest`,
          slug: `metrics-test-${random}`,
        })

        const request = createRequest()
        const response = await request
          .get(`/api/v1/communities?sort=members&q=${random}`)
          .expect(200)

        expect(response.body).toHaveProperty('community_metrics')
        const allCommunityIds = Object.keys(response.body.community_metrics ?? {})
        expect(allCommunityIds.length).toBeGreaterThan(0)
        const firstMetrics = response.body.community_metrics[allCommunityIds[0]!]
        expect(firstMetrics).toHaveProperty('member_count')
        expect(firstMetrics).toHaveProperty('virtual_subscription_count')
      })

      it('returns community_metrics when sort=virtual_subscriptions', async () => {
        const request = createRequest()
        const response = await request
          .get('/api/v1/communities?sort=virtual_subscriptions')
          .expect(200)

        expect(response.body).toHaveProperty('community_metrics')
      })

      it('filters by list_type=follow', async () => {
        const random = createRandomString(8)
        const [followCommunity, muteCommunity] = await Promise.all([
          insertTestCommunity({
            createdById: user.id,
            name: `Follow List ${random}`,
            slug: `follow-list-${random}`,
            list_type: 'follow',
          }),
          insertTestCommunity({
            createdById: user.id,
            name: `Mute List ${random}`,
            slug: `mute-list-${random}`,
            list_type: 'mute',
          }),
        ])

        const request = createRequest()
        const response = await request
          .get(`/api/v1/communities?list_type=follow&q=${random}`)
          .expect(200)

        const ids = response.body.results.map((r: { id: string }) => r.id)
        expect(ids).toContain(followCommunity.id)
        expect(ids).not.toContain(muteCommunity.id)
      })

      it('filters by has_list_items=true', async () => {
        const random = createRandomString(8)
        const [withItems, withoutItems] = await Promise.all([
          insertTestCommunity({
            createdById: user.id,
            name: `${random} HasItems`,
            slug: `has-items-${random}`,
            list_type: 'follow',
          }),
          insertTestCommunity({
            createdById: user.id,
            name: `${random} NoItems`,
            slug: `no-items-${random}`,
            list_type: 'mute',
          }),
        ])

        const topicId = await insertTestTopic({
          name: `API Topic ${random}`,
          slug: `api-topic-${random}`,
          createdById: user.id,
        })
        await insertTestCommunityListItem({
          communityId: withItems.id,
          itemType: 'topic',
          entityId: topicId,
        })

        const request = createRequest()
        const response = await request
          .get(`/api/v1/communities?has_list_items=true&q=${random}`)
          .expect(200)

        const ids = response.body.results.map((r: { id: string }) => r.id)
        expect(ids).toContain(withItems.id)
        expect(ids).not.toContain(withoutItems.id)
      })

      it('filters by has_list_type=true', async () => {
        const random = createRandomString(8)
        const [withType, withoutType] = await Promise.all([
          insertTestCommunity({
            createdById: user.id,
            name: `With Type ${random}`,
            slug: `with-type-${random}`,
            list_type: 'follow',
          }),
          insertTestCommunity({
            createdById: user.id,
            name: `Without Type ${random}`,
            slug: `without-type-${random}`,
          }),
        ])

        const request = createRequest()
        const response = await request
          .get(`/api/v1/communities?has_list_type=true&q=${random}`)
          .expect(200)

        const ids = response.body.results.map((r: { id: string }) => r.id)
        expect(ids).toContain(withType.id)
        expect(ids).not.toContain(withoutType.id)
      })

      it('returns community_metrics when sort=name', async () => {
        const request = createRequest()
        const response = await request.get('/api/v1/communities?sort=name').expect(200)
        expect(response.body).toHaveProperty('community_metrics')
        expect(typeof response.body.community_metrics).toBe('object')
      })

      it('returns community_memberships and pending_application_community_ids for authenticated users', async () => {
        const random = createRandomString(8)
        const authUser = await createTestUser()
        await insertTestCommunity({
          createdById: authUser.id,
          name: `Auth Membership Test ${random}`,
          slug: `auth-membership-test-${random}`,
        })

        const request = createRequest()
        await request.authenticateAs(authUser)
        const response = await request.get(`/api/v1/communities?q=${random}`).expect(200)

        expect(response.body).toHaveProperty('community_memberships')
        expect(typeof response.body.community_memberships).toBe('object')
        expect(response.body).toHaveProperty('pending_application_community_ids')
        expect(Array.isArray(response.body.pending_application_community_ids)).toBe(true)
      })

      it('does not return community_memberships and pending_application_community_ids for unauthenticated users', async () => {
        const request = createRequest()
        const response = await request.get('/api/v1/communities').expect(200)

        expect(response.body.community_memberships).toBeUndefined()
        expect(response.body.pending_application_community_ids).toBeUndefined()
      })

      it('limits anonymous requests to 25', async () => {
        const request = createRequest()
        const response = await request.get('/api/v1/communities?limit=100').expect(200)
        expect(response.body.results.length).toBeLessThanOrEqual(25)
      })
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof insertTestProxyFollowCommunity)
})
