import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  createTestMembership,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPost,
} from '@voucha/test-helpers'
import { callRejectedMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { withConcurrentCommunityMembershipRemovalForTest } from '@voucha/test-helpers/post-delegated-privacy-race'
import { loadWritablePost } from '@services/posts/authorization'
import { getPostByAny } from '@services/posts'

const SCOPES = ['posts:read', 'posts:write'] as const

describe('delegated private community membership fences', () => {
  it.each(['create_post', 'update_post', 'delete_post'] as const)(
    '%s refuses revoked membership after preflight',
    async tool => {
      const user = { ...(await createTestUser()), membership_plan: 'plus' as const }
      await createTestMembership({ user_id: user.id, plan: 'plus' })
      const owner = await createTestUser()
      const community = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner.id,
        role: 'owner',
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: user.id,
        role: 'member',
      })
      const root = await insertTestPost({
        title: 'Private thread',
        slug: crypto.randomUUID(),
        markdown: 'Root',
        createdById: user.id,
        communityId: community.id,
        privacy: 'private',
        broadcast: 'users',
        clearanceStatus: 'approved',
      })
      await insertTestCommunityPostReview({
        communityId: community.id,
        postId: root,
        submittedById: user.id,
      })
      const id = await insertTestPost({
        postType: 'comment',
        title: '',
        slug: crypto.randomUUID(),
        markdown: 'Own comment',
        createdById: user.id,
        communityId: community.id,
        rootId: root,
        parentId: root,
        clearanceStatus: 'approved',
      })
      await expect(loadWritablePost(user, id)).resolves.toMatchObject({ id })
      const args =
        tool === 'create_post'
          ? {
              idempotency_key: crypto.randomUUID(),
              post_type: 'comment',
              parent_id: root,
              markdown: 'Refused',
            }
          : tool === 'update_post'
            ? { id, markdown: 'Refused' }
            : { id }
      expect(
        await withConcurrentCommunityMembershipRemovalForTest(community.id, user.id, () =>
          callRejectedMcpTool(user, tool, args, SCOPES),
        ),
      ).toContain('Post not found')
      expect((await getPostByAny(id, { readOnly: false }))?.markdown).toBe('Own comment')
    },
  )
})
