import { beforeAll, describe, expect, it } from 'vitest'
import { createPost } from '../create.mts'
import { getPostByAny } from '../get.mts'
import { canViewPost } from '../check-privacy-access.mts'
import { updatePost } from '../update.mts'
import { createBroadcastPrivacyAudience } from '@voucha/test-helpers/entities/broadcast-privacy-audience'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import {
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers/entities/communities'
import type { PrivateUser } from '@services/users/types'
import { WEB_PROVENANCE } from '@voucha/test-helpers'

describe('create.broadcast-privacy', () => {
  let creator: PrivateUser

  beforeAll(async () => {
    const audience = await createBroadcastPrivacyAudience()
    creator = audience.creator
  })

  describe('create post with broadcast/privacy', () => {
    it('requires approved community review for direct community comment access', async () => {
      const community = await insertTestCommunity({
        createdById: creator.id,
        post_approval_required_at: new Date(),
      })
      await insertTestCommunityMember({ communityId: community.id, userId: creator.id })

      const post = await createPost(creator, WEB_PROVENANCE, {
        title: 'Pending community comment root',
        markdown: 'pending review',
        post_type: 'discussion',
        community_id: community.id,
        broadcast: 'everyone',
        privacy: 'public',
      })
      const commentId = await insertTestPost({
        title: '',
        slug: `pending-community-comment-${Date.now()}`,
        createdById: creator.id,
        markdown: 'pending comment',
        postType: 'comment',
        rootId: post.id,
        parentId: post.id,
        communityId: community.id,
      })
      const comment = {
        ...(await getPostByAny(commentId))!,
        community_id: community.id,
      }

      await expect(canViewPost(creator, comment)).resolves.toBe(false)
    })

    it('rejects comments on unapproved community posts', async () => {
      const community = await insertTestCommunity({
        createdById: creator.id,
        post_approval_required_at: new Date(),
      })
      await insertTestCommunityMember({ communityId: community.id, userId: creator.id })

      const post = await createPost(creator, WEB_PROVENANCE, {
        title: 'Pending community comment target',
        markdown: 'pending review',
        post_type: 'discussion',
        community_id: community.id,
        broadcast: 'everyone',
        privacy: 'public',
      })

      await expect(
        createPost(creator, WEB_PROVENANCE, {
          markdown: 'blocked comment',
          post_type: 'comment',
          parent_id: post.id,
        }),
      ).rejects.toThrow('Cannot comment on an unapproved community post')
    })

    it('rejects multi-community creation inputs', async () => {
      await expect(
        createPost(creator, WEB_PROVENANCE, {
          title: 'Old cross post input',
          markdown: 'unsupported',
          post_type: 'discussion',
          community_ids: ['00000000-0000-0000-0000-000000000000'],
        } as Parameters<typeof createPost>[2] & { community_ids: string[] }),
      ).rejects.toThrow('community_ids is no longer supported')
    })

    it('rejects invalid explicit community scope on top-level posts', async () => {
      await expect(
        createPost(creator, WEB_PROVENANCE, {
          title: 'Invalid community scope',
          markdown: 'invalid',
          post_type: 'discussion',
          community_id: '',
        }),
      ).rejects.toThrow('Invalid community_id')
    })
  })

  describe('update broadcast/privacy', () => {
    it('update broadcast and privacy', async () => {
      const post = await createPost(creator, WEB_PROVENANCE, {
        title: 'Updatable',
        markdown: 'test',
      })
      const updated = await updatePost(creator, post, {
        broadcast: 'followers',
        privacy: 'private',
      })

      expect(updated!.broadcast).toBe('followers')
      expect(updated!.privacy).toBe('private')
    })

    it('rejects invalid update combination', async () => {
      const post = await createPost(creator, WEB_PROVENANCE, {
        title: 'Invalid update',
        markdown: 'test',
        broadcast: 'followers',
        privacy: 'private',
      })
      await expect(
        updatePost(creator, post, {
          broadcast: 'everyone',
        }),
      ).rejects.toThrow('Posts for everyone must be public')
    })

    it('updates anonymous state', async () => {
      const post = await createPost(creator, WEB_PROVENANCE, {
        title: 'Anonymous toggle',
        markdown: 'test',
      })
      const updated = await updatePost(creator, post, {
        is_anonymous: true,
      })

      expect(updated!.is_anonymous).toBe(true)
    })
  })
})
