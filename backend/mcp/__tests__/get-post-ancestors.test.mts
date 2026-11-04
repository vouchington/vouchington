import { optionArgs, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { describe, expect, it } from 'vitest'
import { createTestPost, createTestUser } from '@voucha/test-helpers'

describe('read_posts.ancestors paging', () => {
  it('pages the parent chain toward the root and repeats the root on each page', async () => {
    const caller = { ...(await createTestUser()), membership_plan: null }
    const root = await createTestPost({ user: caller })
    const ids: string[] = []
    let parentId = root.id
    for (let index = 0; index < 4; index++) {
      const comment = await createTestPost({
        user: caller,
        post_type: 'comment',
        parent_post_id: parentId,
      })
      ids.push(comment.id)
      parentId = comment.id
    }
    const read = (args: Record<string, unknown>) =>
      callStructuredMcpTool(caller, 'read_posts', optionArgs('ancestors', args), ['posts:read'])

    const first = await read({ post_id: ids[3], limit: 2 })
    expect(first).toMatchObject({ success: true, page_info: { has_next_page: true } })
    expect((first.ancestors as { id: string }[]).map(post => post.id)).toEqual([
      root.id,
      ids[1],
      ids[2],
    ])

    const second = await read({
      post_id: ids[3],
      limit: 2,
      after: (first.page_info as { end_cursor: string }).end_cursor,
    })
    expect(second).toMatchObject({ success: true, page_info: { has_next_page: false } })
    expect((second.ancestors as { id: string }[]).map(post => post.id)).toEqual([root.id, ids[0]])

    expect(await read({ post_id: ids[3], after: 'not-a-cursor' })).toMatchObject({
      success: false,
      error: 'Invalid cursor',
    })
    expect(await read({ post_id: root.id })).toMatchObject({
      success: true,
      ancestors: [],
      page_info: { has_next_page: false },
    })
  })
})
