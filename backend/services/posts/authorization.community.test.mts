import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestPost, insertTestCommunity } from '@voucha/test-helpers'
import { getPostByAny } from './get.mts'
import {
  currentUserCanDeletePost,
  currentUserCanLockPost,
  currentUserCanUnpublishFromCommunity,
} from './authorization.mts'

describe('community post mutation authority', () => {
  it.each(['owner', 'moderator'] as const)(
    'preserves %s authority for roots and comments',
    async role => {
      const [author, moderator] = await Promise.all([createTestUser(), createTestUser()])
      const community = await insertTestCommunity({ createdById: author.id })
      const rootId = await insertTestPost({
        title: 'Root',
        slug: crypto.randomUUID(),
        markdown: 'Root',
        createdById: author.id,
        communityId: community.id,
      })
      const commentId = await insertTestPost({
        postType: 'comment',
        title: '',
        slug: crypto.randomUUID(),
        markdown: 'Reply',
        createdById: author.id,
        communityId: community.id,
        rootId,
        parentId: rootId,
      })
      const [root, comment] = await Promise.all([
        getPostByAny(rootId, { readOnly: false }),
        getPostByAny(commentId, { readOnly: false }),
      ])
      const options = { communityMemberRole: role }
      expect(currentUserCanDeletePost(moderator, root!, options)).toBe(false)
      expect(currentUserCanDeletePost(moderator, comment!, options)).toBe(true)
      for (const post of [root!, comment!]) {
        expect(currentUserCanLockPost(moderator, post, options)).toBe(true)
        expect(currentUserCanDeletePost(null, post, options)).toBe(false)
        expect(currentUserCanLockPost(null, post, options)).toBe(false)
        expect(currentUserCanDeletePost(author, post)).toBe(true)
      }
      expect(currentUserCanUnpublishFromCommunity(moderator, root!, options)).toBe(true)
      expect(currentUserCanUnpublishFromCommunity(moderator, comment!, options)).toBe(false)
    },
  )
})
