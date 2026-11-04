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

  it('opens an unmoderated comment as a placeholder, even to its author', async () => {
    const { user, root, reply } = await thread()
    const author = await createTestUser()
    const pending = await reply(root, author)
    await reply(pending)
    await setTestPostClearanceStatus(pending.id, 'pending', author.id)

    // MCP reads as a signed-out caller, so the author's own uncleared comment is a placeholder.
    expect(await resolveReadableThread(user, pending.id)).toMatchObject({ state: 'placeholder' })
    expect(await resolveReadableThread(author, pending.id)).toMatchObject({ state: 'placeholder' })
  })

  it('walks with a null viewer, so it never returns less than the signed-out REST page', async () => {
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
    for (const id of signedOut.ids) expect(mcpIds).toContain(id)
    expect(mcpIds).toContain(nested.id)
    // The viewer's own hide shortens their REST page, never the MCP one.
    expect(signedIn.ids).toEqual([hidden.id, sibling.id])
    expect(signedOut.ids).toEqual([hidden.id, nested.id, sibling.id])
  })
})
