import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  createTestMembership,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPost,
  removeTestCommunityMember,
} from '@voucha/test-helpers'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'
import { archiveTestCommunity } from '@voucha/test-helpers/entities/community-archive'
import { loadWritablePost } from '@services/posts/authorization'
import { deletePost, getPostByAny } from '@services/posts'
import { withCapturedTestQueries } from '@voucha/test-helpers/query-capture'

const SCOPES = ['posts:read', 'posts:write'] as const

describe('delegated private community membership checks', () => {
  it.each(['create_post', 'act_on_post', 'delete_post'] as const)(
    '%s refuses revoked membership after removal commits',
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
      await expect(loadWritablePost(user, id, 'edit')).resolves.toMatchObject({ post: { id } })
      const args =
        tool === 'create_post'
          ? {
              idempotency_key: crypto.randomUUID(),
              post_type: 'comment',
              parent_post_id: root,
              markdown: 'Refused',
            }
          : tool === 'act_on_post'
            ? optionArgs('edit', { id, markdown: 'Refused' })
            : { id }
      await removeTestCommunityMember(community.id, user.id)
      expect(await callRejectedMcpTool(user, tool, args, SCOPES)).toContain('Post not found')
      expect((await getPostByAny(id, { readOnly: false }))?.markdown).toBe('Own comment')
    },
  )
})

describe('delegated moderator deletion recheck', () => {
  it('rejects a stale moderator role after membership removal with a plain role lookup', async () => {
    const owner = await createTestUser()
    const moderator = { ...(await createTestUser()), membership_plan: 'plus' as const }
    await createTestMembership({ user_id: moderator.id, plan: 'plus' })
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'moderator',
    })
    const root = await insertTestPost({
      title: 'Community root',
      slug: crypto.randomUUID(),
      markdown: 'Root',
      createdById: owner.id,
      communityId: community.id,
      clearanceStatus: 'approved',
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId: root,
      submittedById: owner.id,
    })
    const comment = await insertTestPost({
      postType: 'comment',
      title: '',
      slug: crypto.randomUUID(),
      markdown: 'Comment',
      createdById: owner.id,
      communityId: community.id,
      rootId: root,
      parentId: root,
      clearanceStatus: 'approved',
    })
    const { post, communityMemberRole } = await loadWritablePost(moderator, comment, 'delete')
    expect(communityMemberRole).toBe('moderator')
    await removeTestCommunityMember(community.id, moderator.id)
    const { queries } = await withCapturedTestQueries(() =>
      expect(
        deletePost(moderator, post, { communityMemberRole, delegated: true }),
      ).rejects.toMatchObject({
        status: 403,
      }),
    )
    expect((await getPostByAny(comment, { readOnly: false }))?.id).toBe(comment)
    expect(queries.filter(item => item.text.includes('getCommunityMember'))).toHaveLength(1)
    expect(
      queries.filter(item => item.text.includes('lockDelegatedPostCommunity.membership')),
    ).toHaveLength(0)
  })
})

describe('delegated archived community mutations', () => {
  it.each(['act_on_post', 'delete_post'] as const)(
    '%s preserves own-user REST mutation access after community archival',
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
      const args = tool === 'act_on_post' ? optionArgs('edit', { id, title: 'Updated' }) : { id }
      await archiveTestCommunity({ communityId: community.id, archivedById: user.id })
      expect(await callStructuredMcpTool(user, tool, args, SCOPES)).toMatchObject({ success: true })
      const post = await getPostByAny(id, { readOnly: false })
      expect(post?.title ?? null).toBe(tool === 'delete_post' ? null : 'Updated')
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
    // Contribution admissions are serialized per user, so opposing requests run in sequence.
    const reject = (index: 0 | 1) =>
      callRejectedMcpTool(
        user,
        'create_post',
        {
          idempotency_key: crypto.randomUUID(),
          title: 'Invalid discussion',
          community_id: communities[index]!.id,
          parent_post_id: roots[1 - index],
        },
        SCOPES,
      )
    const { result, queries } = await withCapturedTestQueries(async () => [
      await reject(0),
      await reject(1),
    ])
    expect(
      result.every(message =>
        message.includes('Only global posts can be discussed in a community'),
      ),
    ).toBe(true)
    expect(queries.filter(item => item.text.includes('lockDelegatedPostCommunity'))).toHaveLength(0)
  })
})
