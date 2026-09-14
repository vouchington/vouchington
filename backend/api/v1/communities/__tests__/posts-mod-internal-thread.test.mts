import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPendingCommunityPostReview,
  insertTestPost,
} from '@voucha/test-helpers'
import type { Community } from '@services/communities/types'
import type { PrivateUser } from '@services/users/types'

describe('community moderation post mod-internal-thread routes', () => {
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
      slug: `post-mit-post-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Post for post mod-internal-thread',
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

  describe('POST /api/v1/communities/:idOrSlug/posts/:postId/mod-internal-thread', () => {
    it('returns 401 when not authenticated', async () => {
      const postId = await createPendingPost()
      const request = createRequest()
      await request
        .post(`/api/v1/communities/${community.slug}/posts/${postId}/mod-internal-thread`)
        .expect(401)
    })

    it('returns 403 for a non-moderator member', async () => {
      const postId = await createPendingPost()
      const request = createRequest()
      await request.authenticateAs(member)
      await request
        .post(`/api/v1/communities/${community.slug}/posts/${postId}/mod-internal-thread`)
        .expect(403)
    })

    it('allows a community moderator to open a mod internal thread and returns the conversation', async () => {
      const postId = await createPendingPost()
      const request = createRequest()
      await request.authenticateAs(moderator)
      const response = await request
        .post(`/api/v1/communities/${community.slug}/posts/${postId}/mod-internal-thread`)
        .expect(200)
      expect(response.body.conversation).toMatchObject({
        channel_type: 'mod_internal',
        community_id: community.id,
        post_id: postId,
      })
    })

    it('is idempotent — returns the same conversation on repeated calls', async () => {
      const postId = await createPendingPost()
      const request = createRequest()
      await request.authenticateAs(moderator)
      const first = await request
        .post(`/api/v1/communities/${community.slug}/posts/${postId}/mod-internal-thread`)
        .expect(200)
      const second = await request
        .post(`/api/v1/communities/${community.slug}/posts/${postId}/mod-internal-thread`)
        .expect(200)
      expect(second.body.conversation.id).toBe(first.body.conversation.id)
    })

    it('allows a site staff user to open a mod internal thread', async () => {
      const staff = await createTestUser({ extraRoles: ['moderator'] })
      const postId = await createPendingPost()
      const request = createRequest()
      await request.authenticateAs(staff)
      const response = await request
        .post(`/api/v1/communities/${community.slug}/posts/${postId}/mod-internal-thread`)
        .expect(200)
      expect(response.body.conversation).toHaveProperty('id')
    })
  })
})
