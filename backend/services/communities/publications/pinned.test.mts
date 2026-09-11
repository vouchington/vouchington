import { describe, it, expect, beforeAll } from 'vitest'
import {
  archiveTestCommunity,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
  createRandomString,
} from '@voucha/test-helpers'
import { insertTestCommunityPostReview } from '@voucha/test-helpers/entities/community-post-reviews'
import { getPinnedPosts, getPinnedPostIds, setPinnedPosts } from './pinned.mts'
import type { PrivateUser } from '@services/users/types'

describe('pinned posts service', () => {
  let owner: PrivateUser
  let member: PrivateUser

  beforeAll(async () => {
    const [o, m] = await Promise.all([createTestUser(), createTestUser()])
    owner = o!
    member = m!
  })

  async function setupCommunityWithPosts(count: number) {
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner!.id,
      slug: `pinned-test-${random}`,
      post_approval_required_at: new Date(),
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner!.id,
      role: 'owner',
    })

    const postIds: string[] = []
    for (let i = 0; i < count; i++) {
      const r = createRandomString(8)
      const postId = await insertTestPost({
        title: `Pin Test Post ${i} ${random}`,
        slug: `pin-test-post-${random}-${i}-${r}`,
        createdById: owner!.id,
        markdown: 'content',
        communityId: community.id,
      })
      await insertTestCommunityPostReview({
        communityId: community.id,
        postId,
        submittedById: owner!.id,
      })
      postIds.push(postId)
    }

    return { community, postIds }
  }

  describe('getPinnedPosts', () => {
    it('returns empty array for community with no pins', async () => {
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `pinned-empty-${random}`,
      })
      const pins = await getPinnedPosts(community.id)
      expect(pins).toEqual([])
    })

    it('keeps existing pins readable after the community is archived', async () => {
      const { community, postIds } = await setupCommunityWithPosts(1)
      await setPinnedPosts(owner, community.id, postIds)
      await archiveTestCommunity({ communityId: community.id, archivedById: owner.id })

      await expect(getPinnedPostIds(community.id)).resolves.toEqual(postIds)
    })
  })

  describe('getPinnedPostIds', () => {
    it('returns empty array for community with no pins', async () => {
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `pinned-ids-empty-${random}`,
      })
      const ids = await getPinnedPostIds(community.id)
      expect(ids).toEqual([])
    })
  })

  describe('setPinnedPosts', () => {
    it('pins a single post', async () => {
      const { community, postIds } = await setupCommunityWithPosts(1)
      const pins = await setPinnedPosts(owner!, community.id, [postIds[0]!])
      expect(pins).toHaveLength(1)
      expect(pins[0]!.post_id).toBe(postIds[0])
      expect(pins[0]!.order_index).toBe(0)
    })

    it('pins up to 3 posts in correct order', async () => {
      const { community, postIds } = await setupCommunityWithPosts(3)
      const pins = await setPinnedPosts(owner!, community.id, postIds)
      expect(pins).toHaveLength(3)
      expect(pins.map(p => p.post_id)).toEqual(postIds)
      expect(pins.map(p => p.order_index)).toEqual([0, 1, 2])
    })

    it('rejects more than 3 posts', async () => {
      const { community, postIds } = await setupCommunityWithPosts(3)
      const extraRandom = createRandomString(8)
      const extraPostId = await insertTestPost({
        title: `Extra Post ${extraRandom}`,
        slug: `extra-post-${extraRandom}`,
        createdById: owner!.id,
        markdown: 'content',
        communityId: community.id,
      })
      await insertTestCommunityPostReview({
        communityId: community.id,
        postId: extraPostId,
        submittedById: owner!.id,
      })
      await expect(setPinnedPosts(owner!, community.id, [...postIds, extraPostId])).rejects.toThrow(
        Error,
      )
    })

    it('rejects duplicate post IDs', async () => {
      const { community, postIds } = await setupCommunityWithPosts(1)
      await expect(
        setPinnedPosts(owner!, community.id, [postIds[0]!, postIds[0]!]),
      ).rejects.toThrow(Error)
    })

    it('rejects a post not published in the community', async () => {
      const { community } = await setupCommunityWithPosts(0)
      const random = createRandomString(8)
      const outsidePostId = await insertTestPost({
        title: `Outside Post ${random}`,
        slug: `outside-post-${random}`,
        createdById: owner!.id,
        markdown: 'content',
        clearanceStatus: 'approved',
      })
      await expect(setPinnedPosts(owner!, community.id, [outsidePostId])).rejects.toThrow(Error)
    })

    it('clears all pins when given empty array', async () => {
      const { community, postIds } = await setupCommunityWithPosts(2)
      await setPinnedPosts(owner!, community.id, postIds)
      const cleared = await setPinnedPosts(owner!, community.id, [])
      expect(cleared).toEqual([])
      const pins = await getPinnedPosts(community.id)
      expect(pins).toEqual([])
    })

    it('replaces existing pins atomically', async () => {
      const { community, postIds } = await setupCommunityWithPosts(2)
      await setPinnedPosts(owner!, community.id, [postIds[0]!])
      const updated = await setPinnedPosts(owner!, community.id, [postIds[1]!, postIds[0]!])
      expect(updated).toHaveLength(2)
      expect(updated[0]!.post_id).toBe(postIds[1])
      expect(updated[1]!.post_id).toBe(postIds[0])
    })

    it('rejects non-moderator user', async () => {
      const { community, postIds } = await setupCommunityWithPosts(1)
      await insertTestCommunityMember({
        communityId: community.id,
        userId: member!.id,
        role: 'member',
      })
      await expect(setPinnedPosts(member!, community.id, [postIds[0]!])).rejects.toThrow(Error)
    })

    it('rejects archived communities', async () => {
      const { community, postIds } = await setupCommunityWithPosts(1)
      await archiveTestCommunity({ communityId: community.id, archivedById: owner!.id })

      await expect(setPinnedPosts(owner!, community.id, [postIds[0]!])).rejects.toMatchObject({
        status: 403,
      })
    })
  })
})
