import { describe, it, expect, beforeAll } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  createTestPost,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  createTestMembership,
  createRandomString,
} from '@voucha/test-helpers'

describe('moderation-results', () => {
  let owner: PrivateUser
  let regularMember: PrivateUser
  let moderator: PrivateUser
  let plusMember: PrivateUser

  beforeAll(async () => {
    ;[owner, regularMember, moderator, plusMember] = (await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])) as PrivateUser[]
    await createTestMembership({ user_id: plusMember.id, plan: 'plus', status: 'active' })
  })

  describe('Community Moderation Results Routes', () => {
    describe('GET /api/v1/communities/:slug/posts/:postId/moderation-results', () => {
      it('returns 401 for unauthenticated', async () => {
        const random = createRandomString(8)
        const community = await insertTestCommunity({
          createdById: owner.id,
          slug: `mr-unauth-${random}`,
        })
        const post = await createTestPost({ user: owner })

        const request = createRequest()
        await request
          .get(`/api/v1/communities/${community.slug}/posts/${post.id}/moderation-results`)
          .expect(401)
      })

      it('returns 403 for regular member without Plus+', async () => {
        const random = createRandomString(8)
        const community = await insertTestCommunity({
          createdById: owner.id,
          slug: `mr-member-403-${random}`,
        })
        await Promise.all([
          insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
          insertTestCommunityMember({
            communityId: community.id,
            userId: regularMember.id,
            role: 'member',
          }),
        ])
        const post = await createTestPost({ user: owner })

        const request = createRequest()
        await request.authenticateAs(regularMember)
        await request
          .get(`/api/v1/communities/${community.slug}/posts/${post.id}/moderation-results`)
          .expect(403)
      })

      it('returns 200 with results for owner (no membership required)', async () => {
        const random = createRandomString(8)
        const community = await insertTestCommunity({
          createdById: owner.id,
          slug: `mr-owner-200-${random}`,
        })
        await insertTestCommunityMember({
          communityId: community.id,
          userId: owner.id,
          role: 'owner',
        })
        const post = await createTestPost({ user: owner })
        await insertTestCommunityPostReview({ communityId: community.id, postId: post.id })

        const request = createRequest()
        await request.authenticateAs(owner)
        const res = await request
          .get(`/api/v1/communities/${community.slug}/posts/${post.id}/moderation-results`)
          .expect(200)

        expect(Array.isArray(res.body.community_agent_moderations)).toBe(true)
        expect(res.body.platform_moderation).toEqual({ status: 'approved' })
        expect(res.body).not.toHaveProperty('openai_moderation')
      })

      it('exposes only the provider-neutral platform moderation status', async () => {
        const random = createRandomString(8)
        const community = await insertTestCommunity({
          createdById: owner.id,
          slug: `mr-stored-results-${random}`,
        })
        await insertTestCommunityMember({
          communityId: community.id,
          userId: owner.id,
          role: 'owner',
        })
        const post = await createTestPost({ user: owner })
        await insertTestCommunityPostReview({ communityId: community.id, postId: post.id })

        const request = createRequest()
        await request.authenticateAs(owner)
        const response = await request
          .get(`/api/v1/communities/${community.slug}/posts/${post.id}/moderation-results`)
          .expect(200)

        expect(response.body).toMatchObject({
          community_agent_moderations: expect.any(Array),
          platform_moderation: { status: 'approved' },
        })
        expect(response.body).not.toHaveProperty('openai_moderation')
      })

      it('returns 200 for moderator', async () => {
        const random = createRandomString(8)
        const community = await insertTestCommunity({
          createdById: owner.id,
          slug: `mr-mod-200-${random}`,
        })
        await Promise.all([
          insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
          insertTestCommunityMember({
            communityId: community.id,
            userId: moderator.id,
            role: 'moderator',
          }),
        ])
        const post = await createTestPost({ user: owner })
        await insertTestCommunityPostReview({ communityId: community.id, postId: post.id })

        const request = createRequest()
        await request.authenticateAs(moderator)
        const res = await request
          .get(`/api/v1/communities/${community.slug}/posts/${post.id}/moderation-results`)
          .expect(200)

        expect(Array.isArray(res.body.community_agent_moderations)).toBe(true)
      })

      it('returns 200 for Plus+ community member with approved review', async () => {
        const random = createRandomString(8)
        const community = await insertTestCommunity({
          createdById: owner.id,
          slug: `mr-plus-200-${random}`,
        })
        await Promise.all([
          insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
          insertTestCommunityMember({
            communityId: community.id,
            userId: plusMember.id,
            role: 'member',
          }),
        ])

        const post = await createTestPost({ user: owner })
        await insertTestCommunityPostReview({ communityId: community.id, postId: post.id })

        const request = createRequest()
        await request.authenticateAs(plusMember)
        const res = await request
          .get(`/api/v1/communities/${community.slug}/posts/${post.id}/moderation-results`)
          .expect(200)

        expect(Array.isArray(res.body.community_agent_moderations)).toBe(true)
        expect(res.body.platform_moderation).toEqual({ status: 'approved' })
        expect(res.body).not.toHaveProperty('openai_moderation')
      })

      it('returns 404 for Plus+ community member when post has no approved review', async () => {
        const random = createRandomString(8)
        const community = await insertTestCommunity({
          createdById: owner.id,
          slug: `mr-plus-404-${random}`,
        })
        await Promise.all([
          insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
          insertTestCommunityMember({
            communityId: community.id,
            userId: plusMember.id,
            role: 'member',
          }),
        ])

        // Post exists but is NOT published in the community
        const post = await createTestPost({ user: owner })

        const request = createRequest()
        await request.authenticateAs(plusMember)
        await request
          .get(`/api/v1/communities/${community.slug}/posts/${post.id}/moderation-results`)
          .expect(404)
      })
    })
  })
})
