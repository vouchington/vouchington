import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  createTestMembership,
  insertTestPost,
  insertTestCommunity,
  insertTestCommunityMember,
  createTestTopic,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  insertTestStory,
  setTestItemStoryId,
  insertTestPostStory,
} from '@voucha/test-helpers'
import { callRejectedMcpTool, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { getPostByAny } from '@services/posts'

const SCOPES = ['posts:read', 'posts:write'] as const
const input = (fields: Record<string, unknown> = {}) => ({
  idempotency_key: crypto.randomUUID(),
  title: crypto.randomUUID(),
  markdown: 'Useful discussion content.',
  ...fields,
})
async function caller() {
  const user = await createTestUser()
  await createTestMembership({ user_id: user.id, plan: 'plus' })
  return { ...user, membership_plan: 'plus' as const }
}

describe('post MCP write guards — real services', () => {
  it.each([
    {},
    { idempotency_key: 'invalid' },
    { post_type: 'story' },
    { post_type: 'topic_recommendation' },
    { hp_website: 'trap' },
    { markdown: 7 },
  ])('rejects malformed creation before mutation: %j', async fields => {
    const args =
      'idempotency_key' in fields || Object.keys(fields).length
        ? input(fields)
        : { title: 'Missing key' }
    expect(await callRejectedMcpTool(await caller(), 'create_post', args, SCOPES)).toContain(
      'Invalid tool arguments',
    )
  })

  it.each([
    [{ post_type: 'article' }, 'Only administrators'],
    [{ post_type: 'blog_post' }, 'Only administrators'],
    [{ post_type: 'review', markdown: 'Short' }, 'Review'],
    [{ post_type: 'data_point' }, 'data_point_vertical'],
    [{ post_type: 'link' }, 'url or url_id'],
    [{ post_type: 'comment' }, 'parent_id'],
    [{ slug: 'custom' }, 'Only admins'],
    [{ post_type: 'discussion', structured_data: {} }, 'only allowed for data_point'],
  ])('enforces the shared per-type rule for %j', async (fields, message) => {
    expect(
      await callRejectedMcpTool(await caller(), 'create_post', input(fields), SCOPES),
    ).toContain(message)
  })

  it('allows replies to public story posts while rejecting their creation', async () => {
    const [user, author] = await Promise.all([caller(), caller()])
    const id = await insertTestPost({
      postType: 'story',
      title: 'A story',
      slug: crypto.randomUUID(),
      markdown: '',
      createdById: author.id,
      clearanceStatus: 'approved',
    })
    const topic = await createTestTopic({ user: author })
    const feed = await createTestRssFeedWithTiming(topic.id)
    const item = await createTestRssFeedItemWithUrl(feed)
    const story = await insertTestStory()
    await setTestItemStoryId(item.id, story.id)
    await insertTestPostStory(id, story.id, author.id)
    expect(
      await callStructuredMcpTool(
        user,
        'create_post',
        input({ post_type: 'comment', parent_id: id }),
        SCOPES,
      ),
    ).toMatchObject({ post: { post_type: 'comment', parent_id: id } })
  })

  it.each(['update_post', 'delete_post'])(
    'refuses missing %s targets before mutation',
    async name => {
      expect(
        await callRejectedMcpTool(await caller(), name, { id: crypto.randomUUID() }, SCOPES),
      ).toContain('Post not found')
    },
  )

  it('fails closed on a malformed comment root instead of authorizing its public parent', async () => {
    const user = await caller()
    const makeRoot = () =>
      insertTestPost({
        title: crypto.randomUUID(),
        slug: crypto.randomUUID(),
        markdown: 'Root',
        createdById: user.id,
        clearanceStatus: 'approved',
      })
    const [parent, differentRoot] = await Promise.all([makeRoot(), makeRoot()])
    const comment = await insertTestPost({
      postType: 'comment',
      title: '',
      slug: crypto.randomUUID(),
      markdown: 'Malformed retained ancestry',
      createdById: user.id,
      parentId: parent,
      rootId: differentRoot,
      clearanceStatus: 'approved',
    })
    expect(
      await callRejectedMcpTool(
        user,
        'create_post',
        input({ post_type: 'comment', parent_id: comment }),
        SCOPES,
      ),
    ).toContain('Post not found')
  })

  it('refuses a reply to another owner’s private comment chain', async () => {
    const [user, author] = await Promise.all([caller(), caller()])
    const root = await insertTestPost({
      title: 'Private',
      slug: crypto.randomUUID(),
      markdown: 'Private text',
      createdById: author.id,
      privacy: 'private',
      broadcast: 'users',
      clearanceStatus: 'approved',
    })
    const comment = await insertTestPost({
      postType: 'comment',
      title: '',
      slug: crypto.randomUUID(),
      markdown: 'Private reply',
      createdById: author.id,
      rootId: root,
      parentId: root,
      clearanceStatus: 'approved',
    })
    expect(
      await callRejectedMcpTool(
        user,
        'create_post',
        input({ post_type: 'comment', parent_id: comment }),
        SCOPES,
      ),
    ).toContain('Post not found')
  })

  it('uses community membership and enabled-type guards', async () => {
    const user = await caller()
    const community = await insertTestCommunity({ createdById: user.id })
    await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
    const args = input({ community_id: community.id })
    const result = await callStructuredMcpTool(user, 'create_post', args, SCOPES)
    expect(
      (await getPostByAny((result.post as { id: string }).id, { readOnly: false }))?.community_id,
    ).toBe(community.id)
    expect(await callStructuredMcpTool(user, 'create_post', args, SCOPES)).toEqual(result)
    expect(
      await callRejectedMcpTool(
        user,
        'create_post',
        input({ community_id: community.id, post_type: 'review' }),
        SCOPES,
      ),
    ).toContain('not enabled')
    const other = await caller()
    expect(
      await callRejectedMcpTool(
        other,
        'create_post',
        input({ community_id: community.id }),
        SCOPES,
      ),
    ).toContain('cannot post')
  })
})
