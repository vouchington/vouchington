import { optionArgs } from '@voucha/test-helpers/mcp-tool-contract'
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
  return callMcpTool(
    'read_posts',
    optionArgs('descendants', args),
    caller,
    ['posts:read'],
    USER_MCP_SERVER_CONFIG,
  )
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
  return createTestPost({ user, post_type: 'comment', parent_post_id: parentId })
}

describe('read_posts.descendants — real DB', () => {
  let author: Caller
  let other: Caller

  beforeAll(async () => {
    author = asCaller(await createTestUser())
    other = asCaller(await createTestUser())
  })

  describe('pagination', () => {
    it('pages heads and expands their previews through the same option', async () => {
      const root = await createTestPost({ user: author })
      const replies = []
      for (let index = 0; index < 5; index += 1) replies.push(await comment(other, root.id))
      const nested = await comment(author, replies[0]!.id)
      const expected = [replies[0]!.id, nested.id, ...replies.slice(1).map(reply => reply.id)]

      const seen: unknown[] = []
      let after: string | undefined
      let pages = 0
      for (let index = 0; index < 3; index += 1) {
        const { body } = await call(author, { post_id: root.slug, limit: 2, after })
        seen.push(...(ids(body) ?? []))
        expect(body.page_info?.start_cursor).toEqual(expect.any(String))
        after = body.page_info?.has_next_page ? (body.page_info.end_cursor ?? undefined) : undefined
        pages += 1
      }

      expect(pages).toBe(3)
      expect(seen).toEqual(expected)
      expect(after).toBeUndefined()
      const expanded = await call(author, { post_id: replies[0]!.id, limit: 2 })
      expect(ids(expanded.body)).toEqual([nested.id])
    })

    it('returns the whole thread in one page by default, with no next page', async () => {
      const root = await createTestPost({ user: author })
      const first = await comment(other, root.id)
      const second = await comment(author, first.id)

      const { body } = await call(other, { post_id: root.id })

      expect(ids(body)).toEqual([first.id, second.id].toSorted())
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

    it.each([0, -1, 1.5])(
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
    it('lists a pending reply as a placeholder above its valid replies, even for its author', async () => {
      const root = await createTestPost({ user: author })
      const visible = await comment(other, root.id)
      const pending = await comment(other, root.id)
      await setTestPostClearanceStatus(pending.id, 'pending', other.id)
      const underPending = await comment(author, pending.id)
      const deeper = await comment(author, underPending.id)

      for (const caller of [author, other]) {
        const { body } = await call(caller, { post_id: root.id })
        expect(ids(body)).toEqual([visible.id, pending.id, underPending.id, deeper.id])
        expect(body.descendants?.[1]).toMatchObject({
          id: pending.id,
          placeholder_state: 'unmoderated',
          title: '',
        })
      }
    })

    it('lists a deleted reply as a placeholder while the replies below it stay', async () => {
      const root = await createTestPost({ user: author })
      const removed = await comment(other, root.id)
      const reply = await comment(author, removed.id)
      await deleteTestPost(removed.id)

      const { body, text } = await call(author, { post_id: root.id })

      expect(ids(body)).toEqual([removed.id, reply.id])
      expect(body.descendants?.[0]).toMatchObject({ id: removed.id, placeholder_state: 'deleted' })
      expect(body.descendants?.[1]).toMatchObject({ parent_post_id: removed.id })
      expect(text).not.toContain(removed.slug)
    })

    it('hides the author of an anonymous reply from everyone', async () => {
      const root = await createTestPost({ user: author })
      const anonymous = await createTestPost({
        user: author,
        post_type: 'comment',
        parent_post_id: root.id,
        is_anonymous: true,
      })

      const { body, text } = await call(author, { post_id: root.id })

      expect(body.descendants?.[0]).toMatchObject({
        id: anonymous.id,
      })
      expect(body.descendants?.[0]).not.toHaveProperty('created_by_id')
      expect(text).not.toContain(author.id)
    })
  })

  describe('a thread the caller cannot read', () => {
    it('answers a private, pending, deleted or missing thread as not found, and reads a reply under an unmoderated comment', async () => {
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
      ]) {
        expect((await call(author, { post_id: postId })).body).toEqual(NOT_FOUND)
      }
      expect((await call(author, { post_id: underHidden.id })).body).toMatchObject({
        success: true,
      })
    })
  })
})
