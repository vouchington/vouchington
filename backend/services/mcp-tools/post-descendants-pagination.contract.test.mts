import { describe, expect, it } from 'vitest'
import { createTestPost, createTestUser, setTestPostClearanceStatus } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { callStructuredMcpTool, optionArgs } from '@voucha/test-helpers/mcp-tool-contract'
import { commentPlaceholderConfig } from '@services/comments/placeholder-config'
import { paginationConfig } from '@services/pagination'
import type { PrivateUser } from '@services/users/types'
import type { PageInfo } from '@voucha/types/pagination'

type Page = { descendants?: { id: string }[]; page_info?: PageInfo }
const ids = (page: Page) => page.descendants?.map(post => post.id)
async function comment(user: PrivateUser, parentId: string) {
  return createTestPost({ user, post_type: 'comment', parent_post_id: parentId })
}
async function call(user: PrivateUser, args: Record<string, unknown>) {
  const body = await callStructuredMcpTool(
    { ...user, membership_plan: null },
    'read_posts',
    optionArgs('descendants', args),
    ['posts:read'],
  )
  return { body: body as Page }
}

describe('comment descendants REST and MCP parity', () => {
  it('matches REST runtime guards, empty continuation and per-head expansion', async () => {
    const author = await createTestUser()
    const other = await createTestUser()
    overrideDynamicConfigFieldsForTest(commentPlaceholderConfig, {
      descendant_max_heads: 1,
      descendant_max_children_per_head: 1,
    })
    overrideDynamicConfigFieldsForTest(paginationConfig, { descendants_max_limit: 3 })
    const root = await createTestPost({ user: author })
    const pending = await comment(author, root.id)
    await setTestPostClearanceStatus(pending.id, 'pending', author.id)
    const head = await comment(author, root.id)
    const children = [await comment(other, head.id), await comment(other, head.id)]

    const pairedPage = async (postId: string, after?: string) => {
      const rest = await createRequest()
        .get(`/api/v1/posts/${postId}/descendants`)
        .query({ limit: 201, ...(after === undefined ? {} : { after }) })
        .expect(200)
      const { body } = await call(author, { post_id: postId, limit: 201, after })
      expect(ids(body)).toEqual(rest.body.results.map((row: { id: string }) => row.id))
      expect(body.page_info).toEqual(rest.body.page_info)
      return body
    }

    const empty = await pairedPage(root.id)
    expect(ids(empty)).toEqual([])
    expect(empty.page_info).toMatchObject({ has_next_page: true, end_cursor: expect.any(String) })
    const preview = await pairedPage(root.id, empty.page_info!.end_cursor!)
    expect(ids(preview)).toEqual([head.id, children[0]!.id])
    expect(preview.page_info).toMatchObject({ has_next_page: false })

    const expanded = await pairedPage(head.id)
    expect(ids(expanded)).toEqual([children[0]!.id])
    expect(expanded.page_info).toMatchObject({ has_next_page: true })
    const remaining = await pairedPage(head.id, expanded.page_info!.end_cursor!)
    expect(ids(remaining)).toEqual([children[1]!.id])
    expect(remaining.page_info).toMatchObject({ has_next_page: false })

    await createRequest()
      .get(`/api/v1/posts/${root.id}/descendants`)
      .query({ after: '' })
      .expect(400)
    expect((await call(author, { post_id: root.id, after: '' })).body).toEqual({
      success: false,
      error: 'Invalid cursor',
    })
  })
})
