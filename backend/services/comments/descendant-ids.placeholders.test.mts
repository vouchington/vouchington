import { describe, expect, it } from 'vitest'
import {
  createTestPost,
  createTestUser,
  deleteTestPost,
  hidePost,
  setTestPostClearanceStatus,
} from '@voucha/test-helpers'
import { getVisibleCommentDescendantIdsPage } from './descendant-ids.mts'
import { commentPlaceholderHasValidReply } from './placeholder-state.mts'

type TestUser = Awaited<ReturnType<typeof createTestUser>>

async function thread() {
  const user = await createTestUser()
  const root = await createTestPost({ user })
  const reply = (parent: { id: string }, replyUser: TestUser = user) =>
    createTestPost({
      user: replyUser,
      post_type: 'comment',
      parent_post_id: parent.id,
      root_post_id: root.id,
    })
  const walk = async (viewer: TestUser | null, startId = root.id) =>
    (await getVisibleCommentDescendantIdsPage(viewer, root.id, startId, { limit: 100 })).results
  return { user, root, reply, walk }
}

describe('comment placeholders in the descendant walk', () => {
  it('returns a deleted comment as a placeholder only when a valid reply sits below it', async () => {
    const { root, user, reply, walk } = await thread()
    const deleted = await reply(root)
    const valid = await reply(deleted)
    const emptyDeleted = await reply(root)
    await deleteTestPost(deleted.id)
    await deleteTestPost(emptyDeleted.id)

    expect(await walk(null)).toEqual([deleted.id, valid.id])
    expect(await walk(user)).toEqual([deleted.id, valid.id])
  })

  it('shows a chain of placeholders above a valid reply and drops one with none', async () => {
    const { root, reply, walk } = await thread()
    const a = await reply(root)
    const b = await reply(a)
    const c = await reply(b)
    const leaf = await reply(c)
    const emptyA = await reply(root)
    const emptyB = await reply(emptyA)
    const emptyC = await reply(emptyB)
    for (const post of [a, b, c, emptyA, emptyB, emptyC]) await deleteTestPost(post.id)

    expect(await walk(null)).toEqual([a.id, b.id, c.id, leaf.id])
  })

  it('treats an unmoderated comment as a placeholder for others and as valid for its author', async () => {
    const { root, user, reply, walk } = await thread()
    const other = await createTestUser()
    const pending = await reply(root, other)
    const child = await reply(pending)
    await setTestPostClearanceStatus(pending.id, 'pending', other.id)

    expect(await walk(null)).toEqual([pending.id, child.id])
    expect(await walk(user)).toEqual([pending.id, child.id])
    expect(await walk(other)).toEqual([pending.id, child.id])
  })

  it('drops an unmoderated comment with no valid reply and any readable reply of staff', async () => {
    const { root, reply, walk } = await thread()
    const staff = { ...(await createTestUser()), roles: ['moderator' as const] }
    const other = await createTestUser()
    const pending = await reply(root, other)
    await setTestPostClearanceStatus(pending.id, 'pending', other.id)

    expect(await walk(null)).toEqual([])
    expect(await walk(staff)).toEqual([pending.id])
  })

  it('returns nothing for a long chain of placeholders with no valid reply', async () => {
    const { root, reply, walk } = await thread()
    const chain = [await reply(root)]
    for (let i = 0; i < 7; i += 1) chain.push(await reply(chain.at(-1)!))
    for (const post of chain) await deleteTestPost(post.id)

    expect(await walk(null)).toEqual([])
  })

  it('keeps a deleted boundary placeholder and restarts the walk below it', async () => {
    const { root, reply, walk } = await thread()
    const chain = [await reply(root)]
    for (let i = 0; i < 7; i += 1) chain.push(await reply(chain.at(-1)!))
    const valid = await reply(chain.at(-1)!)
    for (const post of chain) await deleteTestPost(post.id)

    expect(await walk(null)).toEqual(chain.slice(0, 7).map(post => post.id))
    expect(await walk(null, chain[6]!.id)).toEqual([chain[7]!.id, valid.id])
  })

  it('keeps an unmoderated boundary placeholder for a signed-out viewer', async () => {
    const { root, user, reply, walk } = await thread()
    const chain = [await reply(root)]
    for (let i = 0; i < 5; i += 1) chain.push(await reply(chain.at(-1)!))
    const pending = await reply(chain.at(-1)!)
    const valid = await reply(pending)
    await setTestPostClearanceStatus(pending.id, 'pending', user.id)

    expect(await walk(null)).toEqual([...chain.map(post => post.id), pending.id])
    expect(await walk(null, pending.id)).toEqual([valid.id])
  })

  it('keeps a hidden placeholder when the look-down limits end the search without an answer', async () => {
    const { root, user, reply, walk } = await thread()
    const chain = [await reply(root)]
    for (let i = 0; i < 6; i += 1) chain.push(await reply(chain.at(-1)!))
    for (const post of chain) await deleteTestPost(post.id)
    await hidePost(user, chain[0]!)

    // The hidden head's lookup stops at the depth cap and keeps it, since a limit never loses a reply.
    expect(await walk(user)).toEqual([chain[0]!.id])
  })

  it('does not descend through a comment the viewer hid but returns it', async () => {
    const { root, user, reply, walk } = await thread()
    const hidden = await reply(root)
    const nested = await reply(hidden)
    const nestedReply = await reply(nested)
    await hidePost(user, hidden)

    expect(await walk(user)).toEqual([hidden.id])
    expect(await walk(null)).toEqual([hidden.id, nested.id, nestedReply.id])
    expect(await walk(user, hidden.id)).toEqual([nested.id, nestedReply.id])
  })

  it('keeps nested hidden comments collapsed inside an expanded one', async () => {
    const { root, user, reply, walk } = await thread()
    const hidden = await reply(root)
    const inner = await reply(hidden)
    const innerReply = await reply(inner)
    await hidePost(user, hidden)
    await hidePost(user, inner)

    expect(await walk(user, hidden.id)).toEqual([inner.id])
    expect(await walk(user, inner.id)).toEqual([innerReply.id])
  })

  it('returns a hidden deleted comment only when a valid reply sits below it', async () => {
    const { root, user, reply, walk } = await thread()
    const withReply = await reply(root)
    const validReply = await reply(withReply)
    const empty = await reply(root)
    await deleteTestPost(withReply.id)
    await deleteTestPost(empty.id)
    await hidePost(user, withReply)
    await hidePost(user, empty)

    expect(await walk(user)).toEqual([withReply.id])
    expect(await walk(user, withReply.id)).toEqual([validReply.id])
  })

  it('ignores another viewer hide and a deleted hide row', async () => {
    const { root, user, reply, walk } = await thread()
    const other = await createTestUser()
    const hidden = await reply(root)
    const child = await reply(hidden)
    await hidePost(other, hidden)

    expect(await walk(user)).toEqual([hidden.id, child.id])
  })

  it('answers whether a placeholder has a valid reply for a standalone read', async () => {
    const { root, reply } = await thread()
    const withReply = await reply(root)
    await reply(withReply)
    const empty = await reply(root)
    await deleteTestPost(withReply.id)
    await deleteTestPost(empty.id)

    expect(await commentPlaceholderHasValidReply(null, root.id, withReply.id)).toBe(true)
    expect(await commentPlaceholderHasValidReply(null, root.id, empty.id)).toBe(false)
  })
})
