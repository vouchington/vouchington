import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  createTestMembership,
  insertTestPost,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  softDeleteUser,
  getPostDeletedById,
} from '@voucha/test-helpers'
import { callStructuredMcpTool, callRejectedMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import {
  withConcurrentActorSuspensionForTest,
  withConcurrentCommunityReviewDisableForTest,
  withConcurrentCommunityDeletionForTest,
  withConcurrentCommunityArchiveForTest,
} from '@voucha/test-helpers/post-delegated-privacy-race'
import { loadWritablePost } from '@services/posts/authorization'
import { deletePost, getPostByAny } from '@services/posts'

const SCOPES = ['posts:read', 'posts:write'] as const
async function caller() {
  const user = await createTestUser()
  await createTestMembership({ user_id: user.id, plan: 'plus' })
  return { ...user, membership_plan: 'plus' as const }
}

describe('delegated post mutation contracts and transaction fences', () => {
  it.each([
    ['images', []],
    ['post_type', 'discussion'],
    ['parent_id', crypto.randomUUID()],
    ['root_id', crypto.randomUUID()],
    ['community_id', crypto.randomUUID()],
    ['url', 'https://example.com'],
    ['url_id', crypto.randomUUID()],
  ])('rejects ignored PATCH field %s at the MCP boundary', async (field, value) => {
    expect(
      await callRejectedMcpTool(
        await caller(),
        'update_post',
        {
          id: crypto.randomUUID(),
          [field as string]: value,
        },
        SCOPES,
      ),
    ).toContain('Invalid tool arguments')
  })

  it('rejects caller-supplied creation ancestry roots', async () => {
    expect(
      await callRejectedMcpTool(
        await caller(),
        'create_post',
        {
          idempotency_key: crypto.randomUUID(),
          title: 'Discussion',
          root_id: crypto.randomUUID(),
        },
        SCOPES,
      ),
    ).toContain('Invalid tool arguments')
  })

  it.each([{ privacy: 'private' }, { broadcast: 'users' }])(
    'rejects ignored comment audience edits %j',
    async changes => {
      const user = await caller()
      const root = await insertTestPost({
        title: 'Root',
        slug: crypto.randomUUID(),
        markdown: 'Root',
        createdById: user.id,
        clearanceStatus: 'approved',
      })
      const id = await insertTestPost({
        postType: 'comment',
        title: '',
        slug: crypto.randomUUID(),
        markdown: 'Own reply',
        createdById: user.id,
        rootId: root,
        parentId: root,
        clearanceStatus: 'approved',
      })
      expect(await callRejectedMcpTool(user, 'update_post', { id, ...changes }, SCOPES)).toContain(
        'Comments inherit their thread audience',
      )
    },
  )

  it('rechecks enabled community types after a concurrent settings transaction', async () => {
    const user = await caller()
    const community = await insertTestCommunity({ createdById: user.id, allow_review_posts: true })
    await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
    const args = {
      idempotency_key: crypto.randomUUID(),
      community_id: community.id,
      post_type: 'review',
      title: crypto.randomUUID(),
      markdown: 'A useful review with detailed first hand observations. '.repeat(20),
    }
    expect(
      await withConcurrentCommunityReviewDisableForTest(community.id, () =>
        callRejectedMcpTool(user, 'create_post', args, SCOPES),
      ),
    ).toContain('review posts are not enabled')
  })

  it('refuses delegated deletion through a stale retained account identity', async () => {
    const user = await caller()
    const id = await insertTestPost({
      title: 'Retained',
      slug: crypto.randomUUID(),
      markdown: 'Retained content',
      createdById: user.id,
      clearanceStatus: 'approved',
    })
    const post = await getPostByAny(id, { readOnly: false })
    await softDeleteUser(user.id)
    await expect(deletePost(user, post!, { delegated: true })).rejects.toMatchObject({
      code: '23514',
    })
    expect(await getPostDeletedById(id)).toEqual({ deleted_by_id: null })
  })
  it.each([
    [{ post_type: 'comment', privacy: 'private' }, 'Comments inherit'],
    [{ post_type: 'comment', broadcast: 'users' }, 'Comments inherit'],
    [{ post_type: 'discussion', review_topic_ratings: [] }, 'only allowed for review'],
    [{ post_type: 'link', url: 'https://example.com', url_id: crypto.randomUUID() }, 'Send either'],
  ])(
    'rejects type-inapplicable creation fields and releases the failed key: %j',
    async (fields, message) => {
      const user = await caller()
      const parent = await insertTestPost({
        title: 'Root',
        slug: crypto.randomUUID(),
        markdown: 'Root',
        createdById: user.id,
        clearanceStatus: 'approved',
      })
      const key = crypto.randomUUID()
      const body = {
        idempotency_key: key,
        title: crypto.randomUUID(),
        markdown: 'Useful content',
        ...fields,
        ...('post_type' in fields && fields.post_type === 'comment' ? { parent_id: parent } : {}),
      }
      expect(await callRejectedMcpTool(user, 'create_post', body, SCOPES)).toContain(message)
      expect(
        await callStructuredMcpTool(
          user,
          'create_post',
          { idempotency_key: key, title: crypto.randomUUID(), markdown: 'Corrected discussion' },
          SCOPES,
        ),
      ).toMatchObject({ success: true, post: { post_type: 'discussion' } })
    },
  )
  it.each(['create_post', 'update_post', 'delete_post'])(
    'refuses %s after community deletion wins the row fence',
    async name => {
      const user = await caller()
      const community = await insertTestCommunity({ createdById: user.id })
      await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
      const root = await insertTestPost({
        title: 'Community root',
        slug: crypto.randomUUID(),
        markdown: 'Root',
        createdById: user.id,
        communityId: community.id,
        clearanceStatus: 'approved',
      })
      await insertTestCommunityPostReview({
        communityId: community.id,
        postId: root,
        submittedById: user.id,
      })
      await expect(loadWritablePost(user, root)).resolves.toMatchObject({ id: root })
      const args =
        name === 'create_post'
          ? {
              idempotency_key: crypto.randomUUID(),
              post_type: 'comment',
              parent_id: root,
              markdown: 'Reply',
            }
          : { id: root, ...(name === 'update_post' ? { title: 'Changed' } : {}) }
      expect(
        await withConcurrentCommunityDeletionForTest(community.id, () =>
          callRejectedMcpTool(user, name, args, SCOPES),
        ),
      ).toContain('Post not found')
    },
  )
  it('refuses a reply after community archiving wins the row fence', async () => {
    const user = await caller()
    const community = await insertTestCommunity({ createdById: user.id })
    await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
    const parent = await insertTestPost({
      title: 'Open community thread',
      slug: crypto.randomUUID(),
      markdown: 'Root',
      createdById: user.id,
      communityId: community.id,
      clearanceStatus: 'approved',
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId: parent,
      submittedById: user.id,
    })
    expect(
      await withConcurrentCommunityArchiveForTest(community.id, () =>
        callRejectedMcpTool(
          user,
          'create_post',
          {
            idempotency_key: crypto.randomUUID(),
            post_type: 'comment',
            parent_id: parent,
            markdown: 'Reply',
          },
          SCOPES,
        ),
      ),
    ).toContain('Community is archived')
  })
})

describe('delegated actor suspension fences', () => {
  it.each(['create_post', 'update_post', 'delete_post'] as const)(
    '%s refuses suspension committed after preflight',
    async tool => {
      const user = await caller()
      const id = await insertTestPost({
        title: 'Owned root',
        slug: crypto.randomUUID(),
        markdown: 'Before',
        createdById: user.id,
        clearanceStatus: 'approved',
      })
      const args =
        tool === 'create_post'
          ? { idempotency_key: crypto.randomUUID(), title: 'Refused' }
          : tool === 'update_post'
            ? { id, title: 'Refused' }
            : { id }
      const result = await withConcurrentActorSuspensionForTest(user.id, () =>
        callRejectedMcpTool(user, tool, args, SCOPES),
      )
      expect(result).toContain('Your account has been suspended')
      const post = await getPostByAny(id, { readOnly: false })
      expect(post?.title).toBe('Owned root')
    },
  )
})
