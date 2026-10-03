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
import {
  withConcurrentCommunityMembershipRemovalForTest,
  withConcurrentCommunityArchiveForTest,
} from '@voucha/test-helpers/post-delegated-privacy-race'
import { loadWritablePost } from '@services/posts/authorization'
import { getPostByAny } from '@services/posts'
import { withCapturedTestQueries } from '@voucha/test-helpers/query-capture'

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

describe('delegated archived community mutations', () => {
  it.each(['update_post', 'delete_post'] as const)(
    '%s refuses community archival after preflight',
    async tool => {
      const user = { ...(await createTestUser()), membership_plan: 'plus' as const }
      await createTestMembership({ user_id: user.id, plan: 'plus' })
      const community = await insertTestCommunity({ createdById: user.id })
      await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
      const id = await insertTestPost({
        title: 'Owned root',
        slug: crypto.randomUUID(),
        markdown: 'Before',
        createdById: user.id,
        communityId: community.id,
        clearanceStatus: 'approved',
      })
      await insertTestCommunityPostReview({
        communityId: community.id,
        postId: id,
        submittedById: user.id,
      })
      expect(
        await withConcurrentCommunityArchiveForTest(community.id, () =>
          callRejectedMcpTool(
            user,
            tool,
            { id, ...(tool === 'update_post' ? { title: 'Refused' } : {}) },
            SCOPES,
          ),
        ),
      ).toContain('Community is archived')
      expect((await getPostByAny(id, { readOnly: false }))?.title).toBe('Owned root')
    },
  )
})

describe('delegated discussion source lock ordering', () => {
  it('rejects opposing community discussion sources before destination or source community fences', async () => {
    const user = { ...(await createTestUser()), membership_plan: 'plus' as const }
    await createTestMembership({ user_id: user.id, plan: 'plus' })
    const communities = await Promise.all([
      insertTestCommunity({ createdById: user.id }),
      insertTestCommunity({ createdById: user.id }),
    ])
    const roots: string[] = []
    for (const community of communities) {
      await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
      const id = await insertTestPost({
        title: 'Community root',
        slug: crypto.randomUUID(),
        markdown: 'Root',
        createdById: user.id,
        communityId: community.id,
      })
      await insertTestCommunityPostReview({
        communityId: community.id,
        postId: id,
        submittedById: user.id,
      })
      roots.push(id)
    }
    const { result, queries } = await withCapturedTestQueries(() =>
      Promise.all(
        communities.map((community, index) =>
          callRejectedMcpTool(
            user,
            'create_post',
            {
              idempotency_key: crypto.randomUUID(),
              title: 'Invalid discussion',
              community_id: community.id,
              parent_id: roots[1 - index],
            },
            SCOPES,
          ),
        ),
      ),
    )
    expect(
      result.every(message =>
        message.includes('Only global posts can be discussed in a community'),
      ),
    ).toBe(true)
    expect(queries.filter(item => item.text.includes('lockDelegatedPostCommunity'))).toHaveLength(0)
  })
})
