import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPendingCommunityPostReview,
  insertTestPost,
} from '@voucha/test-helpers'
import type { Community } from '@services/communities/types'
import type { PrivateUser } from '@services/users/types'

describe('community moderation post claim routes', () => {
  let moderator: PrivateUser
  let member: PrivateUser
  let author: PrivateUser
  let community: Community

  beforeAll(async () => {
    ;[moderator, member, author] = (await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])) as PrivateUser[]
    community = await insertTestCommunity({ createdById: moderator.id })
    await Promise.all([
      insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      }),
      insertTestCommunityMember({ communityId: community.id, userId: member.id, role: 'member' }),
      insertTestCommunityMember({ communityId: community.id, userId: author.id, role: 'member' }),
    ])
  })

  async function createPendingPost(): Promise<string> {
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `post-claim-post-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Post for post claim',
      markdown: 'Body',
      communityId: community.id,
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: author.id,
    })
    return postId
  }

  describe('PUT /api/v1/communities/:idOrSlug/posts/:postId/claim', () => {
    it('returns 401 when not authenticated', async () => {
      const postId = await createPendingPost()
      const request = createRequest()
      await request.put(`/api/v1/communities/${community.slug}/posts/${postId}/claim`).expect(401)
    })

    it('returns 403 for a non-moderator member', async () => {
      const postId = await createPendingPost()
      const request = createRequest()
      await request.authenticateAs(member)
      await request.put(`/api/v1/communities/${community.slug}/posts/${postId}/claim`).expect(403)
    })

    it('allows a community moderator to claim a post and returns claim data', async () => {
      const postId = await createPendingPost()
      const request = createRequest()
      await request.authenticateAs(moderator)
      const response = await request
        .put(`/api/v1/communities/${community.slug}/posts/${postId}/claim`)
        .expect(200)
      expect(response.body.claim).toMatchObject({
        post_id: postId,
        claimed_by_id: moderator.id,
      })
      expect(response.body.claimed_by_other).toBe(false)
    })

    it('allows a site staff user to claim a post', async () => {
      const staff = await createTestUser({ extraRoles: ['moderator'] })
      const postId = await createPendingPost()
      const request = createRequest()
      await request.authenticateAs(staff)
      const response = await request
        .put(`/api/v1/communities/${community.slug}/posts/${postId}/claim`)
        .expect(200)
      expect(response.body.claim).toMatchObject({ post_id: postId })
    })
  })

  describe('DELETE /api/v1/communities/:idOrSlug/posts/:postId/claim', () => {
    it('returns 401 when not authenticated', async () => {
      const postId = await createPendingPost()
      const request = createRequest()
      await request
        .delete(`/api/v1/communities/${community.slug}/posts/${postId}/claim`)
        .expect(401)
    })

    it('returns 403 for a non-moderator member', async () => {
      const postId = await createPendingPost()
      const request = createRequest()
      await request.authenticateAs(member)
      await request
        .delete(`/api/v1/communities/${community.slug}/posts/${postId}/claim`)
        .expect(403)
    })

    it('allows a community moderator to release a post claim and returns 204', async () => {
      const postId = await createPendingPost()
      // First claim it
      const claimRequest = createRequest()
      await claimRequest.authenticateAs(moderator)
      await claimRequest
        .put(`/api/v1/communities/${community.slug}/posts/${postId}/claim`)
        .expect(200)
      // Then release it
      const releaseRequest = createRequest()
      await releaseRequest.authenticateAs(moderator)
      await releaseRequest
        .delete(`/api/v1/communities/${community.slug}/posts/${postId}/claim`)
        .expect(204)
    })

    it('rejects release through a different community URL', async () => {
      const otherCommunity = await insertTestCommunity({ createdById: moderator.id })
      await insertTestCommunityMember({
        communityId: otherCommunity.id,
        userId: moderator.id,
        role: 'moderator',
      })
      const postId = await createPendingPost()
      const claimRequest = createRequest()
      await claimRequest.authenticateAs(moderator)
      await claimRequest
        .put(`/api/v1/communities/${community.slug}/posts/${postId}/claim`)
        .expect(200)

      const releaseRequest = createRequest()
      await releaseRequest.authenticateAs(moderator)
      await releaseRequest
        .delete(`/api/v1/communities/${otherCommunity.slug}/posts/${postId}/claim`)
        .expect(404)
    })
  })
})
