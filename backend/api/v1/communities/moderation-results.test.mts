import { describe, it, expect, beforeAll } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createRequest } from '@voucha/test-helpers/api/server'
import { validateResponseContract } from '../../../test-helpers/api-fixtures/contract-schema.mts'
import { backendResponseContracts } from '../../../test-helpers/api-fixtures/response-contracts.mts'
import {
  createTestUser,
  createTestPost,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  createTestMembership,
  createRandomString,
  insertTestCommunityAgentPrompt,
  insertTestAgentModeration,
} from '@voucha/test-helpers'

const responseContract =
  backendResponseContracts[
    'GET:/api/v1/communities/:communitySlug/posts/:postId/moderation-results'
  ]!

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

        expect(Array.isArray(res.body.results)).toBe(true)
        expect(res.body.page_info).toEqual({
          has_next_page: false,
          start_cursor: null,
          end_cursor: null,
        })
        expect(res.body.platform_moderation).toEqual({ status: 'approved' })
        expect(res.body).not.toHaveProperty('openai_moderation')
      })

      it('returns schema-valid summary pages and rejects invalid or cross-post cursors', async () => {
        const community = await insertTestCommunity({
          createdById: owner.id,
          slug: `mr-pages-${createRandomString(8)}`,
        })
        await insertTestCommunityMember({
          communityId: community.id,
          userId: owner.id,
          role: 'owner',
        })
        const [post, otherPost] = await Promise.all([
          createTestPost({ user: owner }),
          createTestPost({ user: owner }),
        ])
        await Promise.all([
          insertTestCommunityPostReview({ communityId: community.id, postId: post.id }),
          insertTestCommunityPostReview({ communityId: community.id, postId: otherPost.id }),
        ])
        const prompt = await insertTestCommunityAgentPrompt({
          communityId: community.id,
          createdById: owner.id,
          slotAllocated: true,
        })
        const ids = await Promise.all(
          Array.from({ length: 3 }, () =>
            insertTestAgentModeration({
              postId: post.id,
              promptId: prompt.id,
              agentId: prompt.agent_id,
              results: { flagged: false, provider_document: 'private' },
              flagged: false,
            }),
          ),
        )
        const path = `/api/v1/communities/${community.slug}/posts/${post.id}/moderation-results`
        const request = createRequest()
        await request.authenticateAs(owner)
        const first = await request.get(`${path}?limit=2`).expect(200)
        const firstRows = first.body.results as { id: string; post_id: string }[]
        expect(validateResponseContract(responseContract.schema, first.body)).toEqual([])
        expect(firstRows).toHaveLength(2)
        expect(firstRows.map(row => row.id)).toEqual(firstRows.map(row => row.id).toSorted())
        expect(firstRows.every(row => row.post_id === post.id)).toBe(true)
        expect(firstRows.every(row => !('results' in row))).toBe(true)
        expect(first.body).not.toHaveProperty('community_agent_moderations')
        expect(first.body.page_info.has_next_page).toBe(true)
        const cursor = first.body.page_info.end_cursor as string
        expect(cursor).toEqual(expect.any(String))

        const second = await request
          .get(`${path}?limit=2&after=${encodeURIComponent(cursor)}`)
          .expect(200)
        const secondRows = second.body.results as { id: string }[]
        expect(validateResponseContract(responseContract.schema, second.body)).toEqual([])
        expect(secondRows).toHaveLength(1)
        expect(second.body.page_info.has_next_page).toBe(false)
        expect(new Set([...firstRows, ...secondRows].map(row => row.id))).toEqual(new Set(ids))

        await request.get(`${path}?after=invalid`).expect(400)
        await request
          .get(
            `/api/v1/communities/${community.slug}/posts/${otherPost.id}/moderation-results?after=${encodeURIComponent(cursor)}`,
          )
          .expect(400)
        const clamped = await request.get(`${path}?limit=1000`).expect(200)
        expect(clamped.body.results).toHaveLength(3)
        const exact = await request.get(`${path}?limit=3`).expect(200)
        expect(exact.body.results).toHaveLength(3)
        expect(exact.body.page_info.has_next_page).toBe(false)
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

        expect(Array.isArray(res.body.results)).toBe(true)
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

        expect(Array.isArray(res.body.results)).toBe(true)
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
