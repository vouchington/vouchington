import { it, expect, beforeAll, describe } from 'vitest'

import { createPost } from '../create.mts'

import { getPostByAny } from '../get.mts'

import { getPostIds } from '../search/get-ids.mts'

import { canViewPost } from '../check-privacy-access.mts'

import { followUser } from '@voucha/test-helpers/entities/test-entities'

import { insertTestPost } from '@voucha/test-helpers/entities/posts'

import type { PrivateUser } from '@services/users/types'

import { createTestUser } from '@voucha/test-helpers/entities/users'

import { updatePost } from '../update.mts'

import { approveTestPost } from '@voucha/test-helpers/entities/post-clearance'

import {
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers/entities/communities'

import { getCommunityPostReview } from '@services/communities/publications/get'

describe('create.broadcast-privacy', () => {
  let creator: PrivateUser

  let follower: PrivateUser

  let mutualFollower: PrivateUser

  let stranger: PrivateUser

  beforeAll(async () => {
    creator = await createTestUser()
    follower = await createTestUser()
    mutualFollower = await createTestUser()
    stranger = await createTestUser()

    // follower follows creator (one-way)
    await followUser(follower, creator)

    // mutual follow between mutualFollower and creator
    await followUser(mutualFollower, creator)
    await followUser(creator, mutualFollower)
  })

  describe('create post with broadcast/privacy', () => {
    it('creates post with broadcast=users, privacy=public', async () => {
      const post = await createPost(creator, {
        title: 'Signed-in users only',
        markdown: 'test',
        broadcast: 'users',
      })
      const fetched = await getPostByAny(post.id)
      expect(fetched!.broadcast).toBe('users')
      expect(fetched!.privacy).toBe('public')
    })

    it('creates post with broadcast=users, privacy=private', async () => {
      const post = await createPost(creator, {
        title: 'Signed-in users private',
        markdown: 'test',
        broadcast: 'users',
        privacy: 'private',
      })
      const fetched = await getPostByAny(post.id)
      expect(fetched!.broadcast).toBe('users')
      expect(fetched!.privacy).toBe('private')
    })

    it('creates post with broadcast=followers, privacy=public', async () => {
      const post = await createPost(creator, {
        title: 'Followers only',
        markdown: 'test',
        broadcast: 'followers',
      })
      const fetched = await getPostByAny(post.id)
      expect(fetched!.broadcast).toBe('followers')
      expect(fetched!.privacy).toBe('public')
    })

    it('creates post with broadcast=followers, privacy=private', async () => {
      const post = await createPost(creator, {
        title: 'Followers private',
        markdown: 'test',
        broadcast: 'followers',
        privacy: 'private',
      })
      const fetched = await getPostByAny(post.id)
      expect(fetched!.broadcast).toBe('followers')
      expect(fetched!.privacy).toBe('private')
    })

    it('creates post with broadcast=mutual_followers, privacy=private', async () => {
      const post = await createPost(creator, {
        title: 'Mutual private',
        markdown: 'test',
        broadcast: 'mutual_followers',
        privacy: 'private',
      })
      const fetched = await getPostByAny(post.id)
      expect(fetched!.broadcast).toBe('mutual_followers')
      expect(fetched!.privacy).toBe('private')
    })

    it('rejects privacy=private with broadcast=everyone', async () => {
      await expect(
        createPost(creator, {
          title: 'Invalid combo',
          markdown: 'test',
          broadcast: 'everyone',
          privacy: 'private',
        }),
      ).rejects.toThrow('Posts for everyone must be public')
    })

    it('comments always use everyone/public defaults', async () => {
      const parent = await createPost(creator, {
        title: 'Parent',
        markdown: 'parent',
        broadcast: 'followers',
        privacy: 'private',
      })
      const comment = await createPost(creator, {
        markdown: 'comment',
        post_type: 'comment',
        parent_id: parent.id,
        broadcast: 'followers',
        privacy: 'private',
      })
      const fetched = await getPostByAny(comment.id)
      expect(fetched!.broadcast).toBe('everyone')
      expect(fetched!.privacy).toBe('public')
    })

    it('rejects explicit community scope on comments', async () => {
      const parent = await createPost(creator, {
        title: 'Comment community scope parent',
        markdown: 'parent',
      })

      await expect(
        createPost(creator, {
          markdown: 'comment',
          post_type: 'comment',
          parent_id: parent.id,
          community_id: null,
        } as Parameters<typeof createPost>[1] & { community_id: null }),
      ).rejects.toThrow('Comments inherit community scope from their parent')
    })

    it('creates anonymous top-level posts', async () => {
      const post = await createPost(creator, {
        title: 'Anonymous post',
        markdown: 'anon',
        is_anonymous: true,
      })
      const fetched = await getPostByAny(post.id)
      expect(fetched!.is_anonymous).toBe(true)
    })

    it('creates anonymous comments', async () => {
      const parent = await createPost(creator, {
        title: 'Anonymous comment parent',
        markdown: 'parent',
      })
      const comment = await createPost(creator, {
        markdown: 'anon comment',
        post_type: 'comment',
        parent_id: parent.id,
        is_anonymous: true,
      })
      const fetched = await getPostByAny(comment.id)
      expect(fetched!.is_anonymous).toBe(true)
      expect(fetched!.broadcast).toBe('everyone')
    })

    it('creates community-scoped posts with one review row', async () => {
      const community = await insertTestCommunity({ createdById: creator.id })
      await insertTestCommunityMember({ communityId: community.id, userId: creator.id })

      const post = await createPost(creator, {
        title: 'Community scoped',
        markdown: 'community scoped content',
        post_type: 'discussion',
        community_id: community.id,
        broadcast: 'everyone',
        privacy: 'public',
      })

      const review = await getCommunityPostReview(community.id, post.id)
      await approveTestPost(post.id)
      const globalResults = await getPostIds(creator, { user_id: creator.id })
      const globalIds = globalResults.results.map(r => r.id)
      expect(post.community_id).toBe(community.id)
      expect(review?.post_id).toBe(post.id)
      expect(review?.community_id).toBe(community.id)
      expect(globalIds).not.toContain(post.id)
    })

    it('requires private visibility for private community posts', async () => {
      const community = await insertTestCommunity({
        createdById: creator.id,
        visibility: 'private',
      })
      await insertTestCommunityMember({ communityId: community.id, userId: creator.id })

      await expect(
        createPost(creator, {
          title: 'Private community public post',
          markdown: 'should not be public',
          post_type: 'discussion',
          community_id: community.id,
          broadcast: 'everyone',
          privacy: 'public',
        }),
      ).rejects.toThrow('Private community posts must be private for signed-in users')

      await expect(
        createPost(creator, {
          title: 'Private community private post',
          markdown: 'member-only',
          post_type: 'discussion',
          community_id: community.id,
          broadcast: 'users',
          privacy: 'private',
        }),
      ).resolves.toMatchObject({
        community_id: community.id,
        broadcast: 'users',
        privacy: 'private',
      })
    })

    it('requires private community membership for direct post access', async () => {
      const community = await insertTestCommunity({
        createdById: creator.id,
        visibility: 'private',
      })
      const member = await createTestUser()
      await insertTestCommunityMember({ communityId: community.id, userId: creator.id })
      await insertTestCommunityMember({ communityId: community.id, userId: member.id })

      const post = await createPost(creator, {
        title: 'Private community post',
        markdown: 'member-only',
        post_type: 'discussion',
        community_id: community.id,
        broadcast: 'users',
        privacy: 'private',
      })
      await approveTestPost(post.id)
      const approvedPost = (await getPostByAny(post.id))!

      await expect(canViewPost(member, approvedPost)).resolves.toBe(true)
      await expect(canViewPost(stranger, approvedPost)).resolves.toBe(false)
      await expect(canViewPost(null, approvedPost)).resolves.toBe(false)
    })

    it('requires approved community review for direct community post access', async () => {
      const community = await insertTestCommunity({
        createdById: creator.id,
        post_approval_required_at: new Date(),
      })
      await insertTestCommunityMember({ communityId: community.id, userId: creator.id })

      const post = await createPost(creator, {
        title: 'Pending community post',
        markdown: 'pending review',
        post_type: 'discussion',
        community_id: community.id,
        broadcast: 'everyone',
        privacy: 'public',
      })
      await approveTestPost(post.id)
      const approvedPost = (await getPostByAny(post.id))!

      await expect(canViewPost(creator, approvedPost)).resolves.toBe(false)
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof insertTestPost)
  void (0 as unknown as typeof updatePost)
})
