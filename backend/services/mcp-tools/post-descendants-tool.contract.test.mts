import { ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import {
  createTestPost,
  createTestUser,
  deleteTestPost,
  setTestPostClearanceStatus,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { beforeAll, describe, expect, it } from 'vitest'
import { callMcpTool } from './call-tool.mts'
import { USER_MCP_SERVER_CONFIG } from './config.mts'

type Caller = PrivateUser & { membership_plan: null }
type DescendantsResult = {
  success: boolean
  error?: string
  descendants?: Array<Record<string, unknown>>
  page_info?: { has_next_page: boolean; start_cursor: string | null; end_cursor: string | null }
}

const NOT_FOUND = { success: false, error: 'Post not found' }

function asCaller(user: PrivateUser): Caller {
  return { ...user, membership_plan: null }
}

function callRaw(caller: Caller, args: Record<string, unknown>) {
  return callMcpTool('get_post_descendants', args, caller, ['posts:read'], USER_MCP_SERVER_CONFIG)
}

// Every call goes through the real call path, which checks the result against the output schema.
async function call(caller: Caller, args: Record<string, unknown>) {
  const result = await callRaw(caller, args)
  expect(result.isError).toBeUndefined()
  const [block] = result.content as [{ type: 'text'; text: string }]
  expect(result.structuredContent).toEqual(JSON.parse(block.text))
  return { body: result.structuredContent as DescendantsResult, text: block.text }
}

function ids(result: DescendantsResult) {
  return result.descendants?.map(post => post['id'])
}

async function comment(user: PrivateUser, parentId: string) {
  return createTestPost({ user, post_type: 'comment', parent_id: parentId })
}

describe('get_post_descendants — real DB', () => {
  let author: Caller
  let other: Caller

  beforeAll(async () => {
    author = asCaller(await createTestUser())
    other = asCaller(await createTestUser())
  })

  describe('pagination', () => {
    it('walks every reply in id order with round-tripped cursors', async () => {
      const root = await createTestPost({ user: author })
      const replies = []
      for (let index = 0; index < 5; index += 1) replies.push(await comment(other, root.id))
      replies.push(await comment(author, replies[0]!.id))
      const expected = replies.map(reply => reply.id).sort()

      const seen: unknown[] = []
      let after: string | undefined
      let pages = 0
      do {
        const { body } = await call(author, { post_id: root.slug, limit: 2, after })
        seen.push(...(ids(body) ?? []))
        expect(body.descendants).toHaveLength(2)
        expect(body.page_info?.start_cursor).toEqual(expect.any(String))
        after = body.page_info?.has_next_page ? (body.page_info.end_cursor ?? undefined) : undefined
        pages += 1
      } while (after)

      expect(pages).toBe(3)
      expect(seen).toEqual(expected)
    })

    it('returns the whole thread in one page by default, with no next page', async () => {
      const root = await createTestPost({ user: author })
      const first = await comment(other, root.id)
      const second = await comment(author, first.id)

      const { body } = await call(other, { post_id: root.id })

      expect(ids(body)).toEqual([first.id, second.id].sort())
      expect(body.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    })

    it('reads only the subtree below a comment', async () => {
      const root = await createTestPost({ user: author })
      const branch = await comment(other, root.id)
      const sibling = await comment(other, root.id)
      const leaf = await comment(author, branch.id)

      const { body } = await call(author, { post_id: branch.id })

      expect(ids(body)).toEqual([leaf.id])
      expect(ids(body)).not.toContain(sibling.id)
    })

    it('answers a malformed or foreign cursor as an invalid cursor, not a failure', async () => {
      const root = await createTestPost({ user: author })
      const foreignRoot = await createTestPost({ user: author })
      await comment(other, root.id)
      await comment(other, root.id)
      await comment(other, foreignRoot.id)
      await comment(other, foreignRoot.id)
      const foreign = await call(author, { post_id: foreignRoot.id, limit: 1 })

      for (const after of ['not-a-cursor', foreign.body.page_info?.end_cursor]) {
        expect((await call(author, { post_id: root.id, after })).body).toEqual({
          success: false,
          error: 'Invalid cursor',
        })
      }
    })

    it.each([0, 201, 1.5])(
      'rejects the out-of-range limit %s before calling the tool',
      async limit => {
        const root = await createTestPost({ user: author })

        await expect(callRaw(author, { post_id: root.id, limit })).rejects.toMatchObject({
          code: ErrorCode.InvalidParams,
        })
      },
    )
  })

  describe('replies the public cannot see', () => {
    it('omits a pending reply and its whole subtree, even from its author', async () => {
      const root = await createTestPost({ user: author })
      const visible = await comment(other, root.id)
      const pending = await comment(other, root.id)
      await setTestPostClearanceStatus(pending.id, 'pending', other.id)
      const underPending = await comment(author, pending.id)
      const deeper = await comment(author, underPending.id)

      for (const caller of [author, other]) {
        const { body, text } = await call(caller, { post_id: root.id })
        expect(ids(body)).toEqual([visible.id])
        for (const hidden of [pending, underPending, deeper]) expect(text).not.toContain(hidden.id)
      }
    })

    it('leaves a deleted reply out while the replies below it stay', async () => {
      const root = await createTestPost({ user: author })
      const removed = await comment(other, root.id)
      const reply = await comment(author, removed.id)
      await deleteTestPost(removed.id)

      const { body, text } = await call(author, { post_id: root.id })

      expect(ids(body)).toEqual([reply.id])
      expect(body.descendants?.[0]).toMatchObject({ parent_id: removed.id })
      expect(text).not.toContain(removed.slug)
    })

    it('hides the author of an anonymous reply from everyone', async () => {
      const root = await createTestPost({ user: author })
      const anonymous = await createTestPost({
        user: author,
        post_type: 'comment',
        parent_id: root.id,
        is_anonymous: true,
      })

      const { body, text } = await call(author, { post_id: root.id })

      expect(body.descendants?.[0]).toMatchObject({
        id: anonymous.id,
        is_anonymous: true,
        created_by_id: null,
      })
      expect(text).not.toContain(author.id)
    })
  })

  describe('a thread the caller cannot read', () => {
    it('answers a private, pending, deleted, missing or hidden-ancestor thread as not found', async () => {
      const privateRoot = await createTestPost({
        user: author,
        privacy: 'private',
        broadcast: 'users',
      })
      await comment(author, privateRoot.id)
      const pendingRoot = await createTestPost({ user: author })
      await setTestPostClearanceStatus(pendingRoot.id, 'pending', author.id)
      const deletedRoot = await createTestPost({ user: author })
      await deleteTestPost(deletedRoot.id)
      const openRoot = await createTestPost({ user: author })
      const hiddenParent = await comment(other, openRoot.id)
      await setTestPostClearanceStatus(hiddenParent.id, 'pending', other.id)
      const underHidden = await comment(author, hiddenParent.id)

      for (const postId of [
        privateRoot.id,
        pendingRoot.slug,
        deletedRoot.id,
        crypto.randomUUID(),
        'No Such Post!',
        underHidden.id,
      ]) {
        expect((await call(author, { post_id: postId })).body).toEqual(NOT_FOUND)
      }
    })
  })
})
