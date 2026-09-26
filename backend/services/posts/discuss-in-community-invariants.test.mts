import { beforeAll, describe, expect, it } from 'vitest'
import { createPost } from './create.mts'
import { updatePost } from './update.mts'
import { getPostMetricsByAny } from './metrics.mts'
import type { PrivateUser } from '@services/users/types'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import { approveTestPost } from '@voucha/test-helpers/entities/post-clearance'
import {
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers/entities/communities'
import {
  getCommentAncestorIds,
  getCommentAncestorsByAny,
  getVisibleCommentDescendantIdsPage,
} from '@services/comments'
import { WEB_PROVENANCE } from '@voucha/test-helpers'

describe('discuss-in-community-invariants', () => {
  let creator: PrivateUser

  beforeAll(async () => {
    creator = await createTestUser()
  })

  describe('community discuss-in-community invariants', () => {
    it('discusses a public global post as a community discussion', async () => {
      const community = await insertTestCommunity({ createdById: creator.id })
      await insertTestCommunityMember({ communityId: community.id, userId: creator.id })
      const source = await createPost(WEB_PROVENANCE, creator, {
        title: 'Global source',
        markdown: 'public source',
        post_type: 'discussion',
        broadcast: 'everyone',
        privacy: 'public',
      })
      await approveTestPost(source.id)

      const discussInCommunity = await createPost(WEB_PROVENANCE, creator, {
        title: 'Discuss source',
        markdown: 'community discussion',
        post_type: 'discussion',
        community_id: community.id,
        parent_id: source.id,
        broadcast: 'everyone',
        privacy: 'public',
      })

      expect(discussInCommunity.community_id).toBe(community.id)
      expect(discussInCommunity.parent_id).toBe(source.id)
      expect(discussInCommunity.root_id).toBeNull()
      await expect(
        getVisibleCommentDescendantIdsPage(creator, source.id, source.id, { limit: 100 }),
      ).resolves.toMatchObject({ results: expect.not.arrayContaining([discussInCommunity.id]) })
      await expect(getPostMetricsByAny(source.id)).resolves.toMatchObject({
        count: { children: 0 },
      })
    })

    it('rejects restricted global posts as community discussion sources', async () => {
      const community = await insertTestCommunity({ createdById: creator.id })
      await insertTestCommunityMember({ communityId: community.id, userId: creator.id })
      const source = await createPost(WEB_PROVENANCE, creator, {
        title: 'Followers source',
        markdown: 'restricted source',
        post_type: 'discussion',
        broadcast: 'followers',
        privacy: 'public',
      })
      await approveTestPost(source.id)

      await expect(
        createPost(WEB_PROVENANCE, creator, {
          title: 'Discuss restricted source',
          markdown: 'community discussion',
          post_type: 'discussion',
          community_id: community.id,
          parent_id: source.id,
          broadcast: 'everyone',
          privacy: 'public',
        }),
      ).rejects.toThrow('Only globally visible public posts can be discussed in a community')
    })

    it('does not include a community discussion source in comment ancestors', async () => {
      const community = await insertTestCommunity({ createdById: creator.id })
      await insertTestCommunityMember({ communityId: community.id, userId: creator.id })
      const administrator = await createTestUser({ administrator: true })
      const source = await createPost(WEB_PROVENANCE, administrator, {
        title: 'Source article',
        markdown: 'public source',
        post_type: 'article',
        broadcast: 'everyone',
        privacy: 'public',
      })
      await approveTestPost(source.id)
      const discussInCommunity = await createPost(WEB_PROVENANCE, creator, {
        title: 'Discuss article',
        markdown: 'community discussion',
        post_type: 'discussion',
        community_id: community.id,
        parent_id: source.id,
        broadcast: 'everyone',
        privacy: 'public',
      })
      const comment = await createPost(WEB_PROVENANCE, creator, {
        markdown: 'community reply',
        post_type: 'comment',
        parent_id: discussInCommunity.id,
      })

      await expect(getPostMetricsByAny(discussInCommunity.id)).resolves.toMatchObject({
        count: { ancestors: 0 },
      })
      await expect(getCommentAncestorIds(comment.id)).resolves.toEqual([discussInCommunity.id])
      await expect(getCommentAncestorsByAny(comment.id)).resolves.toEqual([
        expect.objectContaining({ id: discussInCommunity.id }),
        expect.objectContaining({ id: comment.id }),
      ])
    })

    it('rejects restricted audience updates for community posts', async () => {
      const community = await insertTestCommunity({ createdById: creator.id })
      await insertTestCommunityMember({ communityId: community.id, userId: creator.id })
      const post = await createPost(WEB_PROVENANCE, creator, {
        title: 'Community update audience',
        markdown: 'test',
        community_id: community.id,
        broadcast: 'everyone',
        privacy: 'public',
      })

      await expect(
        updatePost(creator, post, {
          broadcast: 'followers',
          privacy: 'private',
        }),
      ).rejects.toThrow(
        'Community posts must be public for everyone or private for signed-in users',
      )
    })
  })
})
