import { describe, expect, it } from 'vitest'
import {
  createTestMembership,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPost,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'
import { getPostByAny } from '@services/posts'
import { withCapturedTestQueries } from '@voucha/test-helpers/query-capture'

const SCOPES = ['posts:read', 'posts:write'] as const

async function caller(administrator = false) {
  const user = await createTestUser({ administrator })
  await createTestMembership({ user_id: user.id, plan: 'plus' })
  return { ...user, membership_plan: 'plus' as const }
}

async function root(authorId: string, privacy: 'public' | 'private' = 'public') {
  return insertTestPost({
    title: `Before ${crypto.randomUUID()}`,
    slug: crypto.randomUUID(),
    markdown: 'Before',
    createdById: authorId,
    privacy,
    broadcast: privacy === 'private' ? 'users' : 'everyone',
    clearanceStatus: 'approved',
  })
}

async function rejectedStatus(
  user: Awaited<ReturnType<typeof caller>>,
  tool: 'act_on_post' | 'delete_post',
  args: Record<string, unknown>,
) {
  return (
    JSON.parse(await callRejectedMcpTool(user, tool, args, SCOPES)) as {
      error: { status: number }
    }
  ).error.status
}

describe('delegated post permissions against REST', () => {
  it('lets an administrator edit another author’s public post on both surfaces', async () => {
    const [author, admin] = await Promise.all([caller(), caller(true)])
    const restId = await root(author.id)
    const mcpId = await root(author.id)
    const request = createRequest()
    await request.authenticateAs(admin)
    await request.patch(`/api/v1/posts/${restId}`).send({ title: 'REST edit' }).expect(200)
    expect(
      await callStructuredMcpTool(
        admin,
        'act_on_post',
        optionArgs('edit', { id: mcpId, title: 'MCP edit' }),
        SCOPES,
      ),
    ).toMatchObject({ post: { id: mcpId, title: 'MCP edit' } })
    expect((await getPostByAny(restId, { readOnly: false }))?.title).toBe('REST edit')
  })

  it('hides another author’s private post from an administrator’s credential', async () => {
    const [author, admin] = await Promise.all([caller(), caller(true)])
    const id = await root(author.id, 'private')
    const request = createRequest()
    await request.authenticateAs(admin)
    await request.patch(`/api/v1/posts/${id}`).send({ title: 'REST edit' }).expect(200)
    expect(
      await rejectedStatus(admin, 'act_on_post', optionArgs('edit', { id, title: 'No' })),
    ).toBe(404)
  })

  it('denies a non-administrator editing another author’s public post as REST does', async () => {
    const [author, other] = await Promise.all([caller(), caller()])
    const id = await root(author.id)
    const request = createRequest()
    await request.authenticateAs(other)
    await request.patch(`/api/v1/posts/${id}`).send({ title: 'No' }).expect(403)
    expect(
      await rejectedStatus(other, 'act_on_post', optionArgs('edit', { id, title: 'No' })),
    ).toBe(403)
  })

  it('lets a community moderator delete a public comment on both surfaces, but not its root', async () => {
    const [author, moderator] = await Promise.all([caller(), caller()])
    const community = await insertTestCommunity({ createdById: author.id })
    await insertTestCommunityMember({ communityId: community.id, userId: author.id, role: 'owner' })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'moderator',
    })
    const rootId = await insertTestPost({
      title: `Community ${crypto.randomUUID()}`,
      slug: crypto.randomUUID(),
      markdown: 'Root',
      createdById: author.id,
      communityId: community.id,
      clearanceStatus: 'approved',
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId: rootId,
      submittedById: author.id,
    })
    const comment = () =>
      insertTestPost({
        postType: 'comment',
        title: '',
        slug: crypto.randomUUID(),
        markdown: 'Comment',
        createdById: author.id,
        communityId: community.id,
        rootId,
        parentId: rootId,
        clearanceStatus: 'approved',
      })
    const [restId, mcpId] = await Promise.all([comment(), comment()])
    const request = createRequest()
    await request.authenticateAs(moderator)
    await request.delete(`/api/v1/posts/${restId}`).expect(204)
    const { result, queries } = await withCapturedTestQueries(() =>
      callStructuredMcpTool(moderator, 'delete_post', { id: mcpId }, SCOPES),
    )
    expect(result).toEqual({
      success: true,
    })
    expect(queries.filter(item => item.text.includes('getCommunityMember'))).toHaveLength(1)
    expect(
      queries.filter(item => item.text.includes('lockDelegatedPostCommunity.membership')),
    ).toHaveLength(1)
    expect(await getPostByAny(mcpId, { readOnly: false })).toBeNull()
    await request.delete(`/api/v1/posts/${rootId}`).expect(403)
    expect(await rejectedStatus(moderator, 'delete_post', { id: rootId })).toBe(403)
  })

  it('uses the REST story edit result for a reachable story root', async () => {
    const admin = await caller(true)
    const makeStory = () =>
      insertTestPost({
        postType: 'story',
        title: `Story ${crypto.randomUUID()}`,
        slug: crypto.randomUUID(),
        markdown: '',
        createdById: admin.id,
        clearanceStatus: 'approved',
      })
    const [restId, mcpId] = await Promise.all([makeStory(), makeStory()])
    const request = createRequest()
    await request.authenticateAs(admin)
    await request.patch(`/api/v1/posts/${restId}`).send({ title: 'REST story' }).expect(200)
    expect(
      await callStructuredMcpTool(
        admin,
        'act_on_post',
        optionArgs('edit', { id: mcpId, title: 'MCP story' }),
        SCOPES,
      ),
    ).toMatchObject({ post: { id: mcpId, title: 'MCP story' } })
    await request.delete(`/api/v1/posts/${restId}`).expect(204)
    expect(await callStructuredMcpTool(admin, 'delete_post', { id: mcpId }, SCOPES)).toEqual({
      success: true,
    })
  })
})
