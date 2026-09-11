import { describe, it, expect } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
} from '@voucha/test-helpers'
import { createRandomString } from '@voucha/test-helpers/data'
import { createPost } from '../create.mts'
import { banUserFromCommunity } from '@services/communities/bans/create'

// Split out of @services/communities/bans/__tests__/enforcement.test.mts: these two describe
// blocks call the real createPost (posts legitimately depends on communities one-way to
// enforce bans during post/comment creation; communities must not depend on posts).
describe('community ban enforcement — post creation', () => {
  describe('post creation enforcement', () => {
    it('banned user cannot post in community', async () => {
      const [owner, user] = await Promise.all([createTestUser(), createTestUser()])
      const community = await insertTestCommunity({
        createdById: owner!.id,
        visibility: 'public',
      })
      await Promise.all([
        insertTestCommunityMember({ communityId: community.id, userId: owner!.id, role: 'owner' }),
        insertTestCommunityMember({ communityId: community.id, userId: user!.id }),
      ])
      await banUserFromCommunity(owner!, community.id, user!.id)

      await expect(
        createPost(user!, {
          title: `Ban enforcement post ${createRandomString(8)}`,
          markdown: 'blocked content',
          post_type: 'discussion',
          broadcast: 'everyone',
          privacy: 'public',
          community_id: community.id,
        }),
      ).rejects.toMatchObject({
        status: 403,
        code: 'COMMUNITY_BANNED',
      })
    })
  })

  describe('comment enforcement', () => {
    it('banned user cannot comment on a community post', async () => {
      const [owner, user] = await Promise.all([createTestUser(), createTestUser()])
      const community = await insertTestCommunity({
        createdById: owner!.id,
        visibility: 'public',
      })
      await Promise.all([
        insertTestCommunityMember({ communityId: community.id, userId: owner!.id, role: 'owner' }),
        insertTestCommunityMember({ communityId: community.id, userId: user!.id }),
      ])

      // Owner creates an approved community post
      const postId = await insertTestPost({
        title: `Community post for comment ban test ${createRandomString(8)}`,
        slug: `ban-comment-test-${createRandomString(8)}`,
        createdById: owner!.id,
        markdown: 'content',
        communityId: community.id,
      })

      await banUserFromCommunity(owner!, community.id, user!.id)

      await expect(
        createPost(user!, {
          markdown: 'banned comment',
          post_type: 'comment',
          parent_id: postId,
        }),
      ).rejects.toMatchObject({
        status: 403,
        code: 'COMMUNITY_BANNED',
      })
    })
  })
})
