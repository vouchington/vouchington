import { it, expect, beforeAll, describe } from 'vitest'
import {
  createTestUser,
  createRandomString,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
} from '@voucha/test-helpers'
import { insertTestPendingCommunityPostReview } from '@voucha/test-helpers/entities/community-post-reviews'
import { approvePublication, rejectPublication } from './moderate.mts'
import { getCommunityPostReview, searchPendingPosts } from './get.mts'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '../types.mts'

describe('index', () => {
  let owner: PrivateUser
  let member: PrivateUser
  let community: Community
  let approvalCommunity: Community

  // Raw-helper equivalents of the real community-post creation path: skip createPost's
  // authorization/restriction enforcement (covered separately in
  // @services/posts/__tests__/create-community-post-authorization.test.mts) and insert the
  // post + review directly, since these describe blocks only need "some post in this state."
  async function insertPendingPost(communityId: string, createdById: string): Promise<string> {
    const r = createRandomString(8)
    const postId = await insertTestPost({
      title: `Community Post ${r}`,
      slug: `community-post-${r}`,
      markdown: 'Community post content',
      createdById,
      communityId,
    })
    await insertTestPendingCommunityPostReview({ communityId, postId, submittedById: createdById })
    return postId
  }

  beforeAll(async () => {
    ;[owner, member] = await Promise.all([createTestUser(), createTestUser()])

    ;[community, approvalCommunity] = await Promise.all([
      insertTestCommunity({
        createdById: owner.id,
        post_approval_required_at: null,
      }),
      insertTestCommunity({
        createdById: owner.id,
        post_approval_required_at: new Date(),
      }),
    ])

    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({ communityId: community.id, userId: member.id, role: 'member' }),
      insertTestCommunityMember({
        communityId: approvalCommunity.id,
        userId: owner.id,
        role: 'owner',
      }),
      insertTestCommunityMember({
        communityId: approvalCommunity.id,
        userId: member.id,
        role: 'member',
      }),
    ])
  })

  describe('searchPendingPosts', () => {
    it('returns pending posts for mod queue', async () => {
      const postId = await insertPendingPost(approvalCommunity.id, member.id)

      const result = await searchPendingPosts(approvalCommunity.id)
      expect(result.results.map(r => r.id)).toContain(postId)
    })
  })

  describe('approvePublication / rejectPublication', () => {
    it('owner can approve a pending publication', async () => {
      const postId = await insertPendingPost(approvalCommunity.id, member.id)

      await approvePublication(owner, approvalCommunity.id, postId)

      const review = await getCommunityPostReview(approvalCommunity.id, postId)
      expect(review?.approved_at).toBeInstanceOf(Date)
    })

    it('owner can reject a pending publication', async () => {
      const postId = await insertPendingPost(approvalCommunity.id, member.id)

      await rejectPublication(owner, approvalCommunity.id, postId, 'Not relevant')

      const pendingResult = await searchPendingPosts(approvalCommunity.id)
      const pendingIds = pendingResult.results.map(r => r.id)
      expect(pendingIds).not.toContain(postId)
    })

    it('non-mod cannot approve publication', async () => {
      const postId = await insertPendingPost(approvalCommunity.id, member.id)

      await expect(approvePublication(member, approvalCommunity.id, postId)).rejects.toMatchObject({
        status: 403,
      })
    })
  })
})
