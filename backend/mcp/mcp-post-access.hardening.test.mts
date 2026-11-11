import { createRequest } from '@voucha/test-helpers/api/server'
import { callStructuredMcpTool, optionArgs } from '@voucha/test-helpers/mcp-tool-contract'
import { describe, expect, it } from 'vitest'
import {
  createTestPost,
  createTestUser,
  deleteTestPost,
  hidePost,
  setTestPostClearanceStatus,
} from '@voucha/test-helpers'
import { getCommentDescendantsPage } from '@services/comments'
import { caches } from '@services/entity-cache/caches'
import getPostDescendantsTool from './get-post-descendants.mts'
import { resolveReadableThread } from './mcp-post-access.mts'

type TestUser = Awaited<ReturnType<typeof createTestUser>>

async function thread() {
  const user = await createTestUser()
  const root = await createTestPost({ user })
  const reply = (parent: { id: string }, author: TestUser = user) =>
    createTestPost({
      user: author,
      post_type: 'comment',
      parent_post_id: parent.id,
      root_post_id: root.id,
    })
  const remove = async (post: { id: string }) => {
    await deleteTestPost(post.id)
    await caches.posts.delete(post.id)
  }
  return { user, root, reply, remove }
}

describe('MCP reads of placeholder comments', () => {
  it('matches REST creator and outsider access to a pending private post', async () => {
    const creator = await createTestUser()
    const outsider = await createTestUser()
    const post = await createTestPost({ user: creator, privacy: 'private', broadcast: 'users' })
    await setTestPostClearanceStatus(post.id, 'pending', creator.id)
    for (const [viewer, status] of [
      [creator, 200],
      [outsider, 404],
    ] as const) {
      const request = createRequest()
      await request.authenticateAs(viewer)
      await request.get(`/api/v1/posts/${post.id}`).expect(status)
      const result = await callStructuredMcpTool(
        { ...viewer, membership_plan: null },
        'read_posts',
        optionArgs('details', { post_id: post.id }),
        ['posts:read'],
      )
      expect(result.success).toBe(status === 200)
      expect((result.post as { id: string } | undefined)?.id).toBe(
        status === 200 ? post.id : undefined,
      )
    }
  })

  it('opens a deleted comment as a placeholder only when a valid reply sits below it', async () => {
    const { user, root, reply, remove } = await thread()
    const withReply = await reply(root)
    const valid = await reply(withReply)
    const empty = await reply(root)
    await remove(withReply)
    await remove(empty)

    const placeholder = await resolveReadableThread(user, withReply.id)
    expect(placeholder).toMatchObject({ state: 'placeholder', post: { id: withReply.id } })
    // A valid reply is readable although the comment above it is a placeholder.
    expect(await resolveReadableThread(user, valid.id)).toMatchObject({ state: 'readable' })
    expect(await resolveReadableThread(user, empty.id)).toBeNull()
  })

  it('opens an unmoderated comment for its author and a placeholder for other viewers', async () => {
    const { user, root, reply } = await thread()
    const author = await createTestUser()
    const pending = await reply(root, author)
    await reply(pending)
    await setTestPostClearanceStatus(pending.id, 'pending', author.id)

    expect(await resolveReadableThread(user, pending.id)).toMatchObject({ state: 'placeholder' })
    expect(await resolveReadableThread(author, pending.id)).toMatchObject({ state: 'readable' })
    for (const viewer of [author, user]) {
      const request = createRequest()
      await request.authenticateAs(viewer)
      const rest = await request.get(`/api/v1/posts/${pending.id}`).expect(200)
      const mcp = await callStructuredMcpTool(
        { ...viewer, membership_plan: null },
        'read_posts',
        optionArgs('details', { post_id: pending.id }),
        ['posts:read'],
      )
      expect((mcp.post as { placeholder_state?: string }).placeholder_state).toBe(
        rest.body.post.placeholder_state,
      )
      expect((mcp.post as { markdown: string }).markdown.includes(pending.markdown)).toBe(
        viewer.id === author.id,
      )
    }
  })

  it('walks with the REST viewer so hidden branches have the same descendants', async () => {
    const { user, root, reply } = await thread()
    const hidden = await reply(root)
    const nested = await reply(hidden)
    const sibling = await reply(root)
    await hidePost(user, hidden)

    const signedOut = await getCommentDescendantsPage(null, root, { limit: 100 })
    const signedIn = await getCommentDescendantsPage(user, root, { limit: 100 })
    const viaMcp = await getPostDescendantsTool.function(user)({ post_id: root.id })

    expect(viaMcp).toMatchObject({ success: true })
    const mcpIds = (viaMcp as { descendants: { id: string }[] }).descendants.map(post => post.id)
    expect(mcpIds).toEqual(signedIn.ids)
    expect(mcpIds).not.toContain(nested.id)
    // Both authenticated surfaces stop previews beneath the viewer's hidden branch.
    expect(signedIn.ids).toEqual([hidden.id, sibling.id])
    expect(signedOut.ids).toEqual([hidden.id, nested.id, sibling.id])
  })
})
