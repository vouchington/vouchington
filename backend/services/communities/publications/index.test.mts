import { it, expect, beforeAll, describe } from 'vitest'
import {
  createTestUser,
  createRandomString,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
  setPostVotesScoreUp,
} from '@voucha/test-helpers'
import {
  insertTestCommunityPostReview,
  insertTestPendingCommunityPostReview,
} from '@voucha/test-helpers/entities/community-post-reviews'
import { approvePublication, rejectPublication, unpublishPost } from './moderate.mts'
import { searchCommunityPosts, searchPendingPosts, getApprovedReviewsForPost } from './get.mts'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '../types.mts'

describe('index', () => {
  let owner: PrivateUser
  let member: PrivateUser
  let community: Community
  let approvalCommunity: Community

  function makePost(createdById: string): Promise<string> {
    const r = createRandomString(8)
    return insertTestPost({
      title: `Pub Test Post ${r}`,
      slug: `pub-test-post-${r}`,
      markdown: 'Test content',
      createdById,
    })
  }

  // Raw-helper equivalents of the real community-post creation path: skip createPost's
  // authorization/restriction enforcement (covered separately in
  // @services/posts/__tests__/create-community-post-authorization.test.mts) and insert the
  // post + review directly, since these describe blocks only need "some post in this state."
  async function insertApprovedPost(communityId: string, createdById: string): Promise<string> {
    const r = createRandomString(8)
    const postId = await insertTestPost({
      title: `Community Post ${r}`,
      slug: `community-post-${r}`,
      markdown: 'Community post content',
      createdById,
      communityId,
    })
    await insertTestCommunityPostReview({ communityId, postId, submittedById: createdById })
    return postId
  }

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

  describe('searchCommunityPosts', () => {
    async function createSearchCommunity() {
      const r = createRandomString(8)
      const testCommunity = await insertTestCommunity({
        createdById: owner.id,
        slug: `search-community-posts-${r}`,
      })
      await insertTestCommunityMember({
        communityId: testCommunity.id,
        userId: owner.id,
        role: 'owner',
      })
      return testCommunity
    }

    async function insertApprovedCommunityPost(
      testCommunity: Community,
      options: { title: string; createdAt: Date; scoreUp?: number },
    ) {
      const r = createRandomString(8)
      const postId = await insertTestPost({
        title: `${options.title} ${r}`,
        slug: `search-community-post-${r}`,
        markdown: 'Community search content',
        createdById: owner.id,
        communityId: testCommunity.id,
        createdAt: options.createdAt,
      })
      await insertTestCommunityPostReview({
        communityId: testCommunity.id,
        postId,
        submittedById: owner.id,
      })
      if (options.scoreUp !== undefined) await setPostVotesScoreUp(postId, options.scoreUp)
      return postId
    }

    it('returns approved posts for community', async () => {
      const postId = await insertApprovedPost(community.id, member.id)

      const result = await searchCommunityPosts(community.id)
      expect(result.results.map(r => r.id)).toContain(postId)
    })

    it('sorts approved posts newest first by default', async () => {
      const testCommunity = await createSearchCommunity()
      const olderPostId = await insertApprovedCommunityPost(testCommunity, {
        title: 'Older default sort post',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      })
      const newerPostId = await insertApprovedCommunityPost(testCommunity, {
        title: 'Newer default sort post',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      })

      expect(
        (await searchCommunityPosts(testCommunity.id, { limit: 2 })).results.map(post => post.id),
      ).toEqual([newerPostId, olderPostId])
    })

    it('sorts approved posts by hot score', async () => {
      const testCommunity = await createSearchCommunity()
      const lowScorePostId = await insertApprovedCommunityPost(testCommunity, {
        title: 'Low score hot post',
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
        scoreUp: 1,
      })
      const highScorePostId = await insertApprovedCommunityPost(testCommunity, {
        title: 'High score hot post',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        scoreUp: 100,
      })

      const result = await searchCommunityPosts(testCommunity.id, { sort: 'hot', limit: 2 })

      expect(result.results.map(post => post.id)).toEqual([highScorePostId, lowScorePostId])
    })

    it('paginates hot sorted approved posts with score cursors', async () => {
      const testCommunity = await createSearchCommunity()
      await Promise.all([
        insertApprovedCommunityPost(testCommunity, {
          title: 'First hot page post',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          scoreUp: 30,
        }),
        insertApprovedCommunityPost(testCommunity, {
          title: 'Second hot page post',
          createdAt: new Date('2026-01-01T00:00:01.000Z'),
          scoreUp: 20,
        }),
        insertApprovedCommunityPost(testCommunity, {
          title: 'Third hot page post',
          createdAt: new Date('2026-01-01T00:00:02.000Z'),
          scoreUp: 10,
        }),
      ])

      const firstPage = await searchCommunityPosts(testCommunity.id, { sort: 'hot', limit: 1 })
      const secondPage = await searchCommunityPosts(testCommunity.id, {
        sort: 'hot',
        limit: 1,
        after: firstPage.page_info.end_cursor!,
      })

      expect(secondPage.results).toHaveLength(1)
      expect(secondPage.results[0]?.id).not.toBe(firstPage.results[0]?.id)
    })

    it('does not return pending posts', async () => {
      const postId = await insertPendingPost(approvalCommunity.id, member.id)

      const result = await searchCommunityPosts(approvalCommunity.id)
      expect(result.results.map(r => r.id)).not.toContain(postId)
    })
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

      const result = await searchCommunityPosts(approvalCommunity.id)
      const ids = result.results.map(r => r.id)
      expect(ids).toContain(postId)
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

  describe('getApprovedReviewsForPost', () => {
    it('returns community IDs for approved reviews', async () => {
      const postId = await insertApprovedPost(community.id, member.id)

      const communityIds = await getApprovedReviewsForPost(postId)
      expect(communityIds).toContain(community.id)
    })

    it('does not return pending reviews', async () => {
      const postId = await insertPendingPost(approvalCommunity.id, member.id)

      const communityIds = await getApprovedReviewsForPost(postId)
      expect(communityIds).not.toContain(approvalCommunity.id)
    })

    it('does not return unpublished reviews', async () => {
      const postId = await insertApprovedPost(community.id, member.id)
      await unpublishPost(owner, community.id, postId)

      const communityIds = await getApprovedReviewsForPost(postId)
      expect(communityIds).not.toContain(community.id)
    })

    it('does not return rejected reviews', async () => {
      const postId = await insertPendingPost(approvalCommunity.id, member.id)
      await rejectPublication(owner, approvalCommunity.id, postId)

      const communityIds = await getApprovedReviewsForPost(postId)
      expect(communityIds).not.toContain(approvalCommunity.id)
    })

    it('returns empty array when post has no approved review', async () => {
      const postId = await makePost(member.id)

      const communityIds = await getApprovedReviewsForPost(postId)
      expect(communityIds).toHaveLength(0)
    })
  })
})
