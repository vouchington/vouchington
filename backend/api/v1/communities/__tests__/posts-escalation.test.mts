import { beforeAll, describe, it } from 'vitest'
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

describe('community moderation post escalation routes', () => {
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
      slug: `post-esc-post-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Post for post escalation',
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

  describe('POST /api/v1/communities/:idOrSlug/posts/:postId/escalation', () => {
    it('returns 401 when not authenticated', async () => {
      const postId = await createPendingPost()
      const request = createRequest()
      await request
        .post(`/api/v1/communities/${community.slug}/posts/${postId}/escalation`)
        .expect(401)
    })

    it('returns 403 for a non-moderator member', async () => {
      const postId = await createPendingPost()
      const request = createRequest()
      await request.authenticateAs(member)
      await request
        .post(`/api/v1/communities/${community.slug}/posts/${postId}/escalation`)
        .expect(403)
    })

    it('allows a community moderator to escalate a post and returns 204', async () => {
      const postId = await createPendingPost()
      const request = createRequest()
      await request.authenticateAs(moderator)
      await request
        .post(`/api/v1/communities/${community.slug}/posts/${postId}/escalation`)
        .expect(204)
    })

    it('allows a site staff user to escalate a post', async () => {
      const staff = await createTestUser({ extraRoles: ['moderator'] })
      const postId = await createPendingPost()
      const request = createRequest()
      await request.authenticateAs(staff)
      await request
        .post(`/api/v1/communities/${community.slug}/posts/${postId}/escalation`)
        .expect(204)
    })
  })

  describe('DELETE /api/v1/communities/:idOrSlug/posts/:postId/escalation', () => {
    it('returns 401 when not authenticated', async () => {
      const postId = await createPendingPost()
      const request = createRequest()
      await request
        .delete(`/api/v1/communities/${community.slug}/posts/${postId}/escalation`)
        .expect(401)
    })

    it('returns 403 for a non-moderator member', async () => {
      const postId = await createPendingPost()
      const request = createRequest()
      await request.authenticateAs(member)
      await request
        .delete(`/api/v1/communities/${community.slug}/posts/${postId}/escalation`)
        .expect(403)
    })

    it('allows a community moderator to de-escalate a post and returns 204', async () => {
      const postId = await createPendingPost()
      // First escalate
      const escRequest = createRequest()
      await escRequest.authenticateAs(moderator)
      await escRequest
        .post(`/api/v1/communities/${community.slug}/posts/${postId}/escalation`)
        .expect(204)
      // Then de-escalate
      const deEscRequest = createRequest()
      await deEscRequest.authenticateAs(moderator)
      await deEscRequest
        .delete(`/api/v1/communities/${community.slug}/posts/${postId}/escalation`)
        .expect(204)
    })

    it('rejects de-escalation through a different community URL', async () => {
      const otherCommunity = await insertTestCommunity({ createdById: moderator.id })
      await insertTestCommunityMember({
        communityId: otherCommunity.id,
        userId: moderator.id,
        role: 'moderator',
      })
      const postId = await createPendingPost()
      const escRequest = createRequest()
      await escRequest.authenticateAs(moderator)
      await escRequest
        .post(`/api/v1/communities/${community.slug}/posts/${postId}/escalation`)
        .expect(204)

      const deEscRequest = createRequest()
      await deEscRequest.authenticateAs(moderator)
      await deEscRequest
        .delete(`/api/v1/communities/${otherCommunity.slug}/posts/${postId}/escalation`)
        .expect(404)
    })
  })
})
