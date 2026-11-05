import { describe, expect, it } from 'vitest'
import { createTestPost, createTestUser } from '@voucha/test-helpers'
import { getCommentDescendantsPage } from './descendant-page.mts'

describe('comment descendant page depth', () => {
  it('pages only within a depth window and starts a new one from a boundary permalink', async () => {
    const user = await createTestUser()
    const root = await createTestPost({ user })
    const chain: Awaited<ReturnType<typeof createTestPost>>[] = []
    for (let i = 0; i < 8; i += 1) {
      chain.push(
        await createTestPost({
          user,
          post_type: 'comment',
          parent_post_id: chain.at(-1)?.id ?? root.id,
          root_post_id: root.id,
        }),
      )
    }
    const ids = chain.map(post => post.id)
    const rootPost = { id: root.id, root_post_id: null }

    const fullWindow = await getCommentDescendantsPage(null, rootPost, { limit: 100 })
    expect(fullWindow.ids).toEqual(ids.slice(0, 7))
    expect(fullWindow.pageInfo.has_next_page).toBe(false)

    const firstPage = await getCommentDescendantsPage(null, rootPost, { limit: 6 })
    expect(firstPage.ids).toEqual(ids.slice(0, 6))
    expect(firstPage.pageInfo.has_next_page).toBe(true)
    expect(firstPage.pageInfo.end_cursor).toEqual(expect.any(String))

    const secondPage = await getCommentDescendantsPage(null, rootPost, {
      limit: 6,
      after: firstPage.pageInfo.end_cursor!,
    })
    expect(secondPage.ids).toEqual([ids[6]])
    expect(secondPage.pageInfo.has_next_page).toBe(false)
    expect(secondPage.pageInfo.end_cursor).toBeNull()

    const opened = await getCommentDescendantsPage(
      null,
      { id: ids[6]!, root_post_id: root.id },
      { limit: 100 },
    )
    expect(opened.ids).toEqual([ids[7]])
    expect(opened.pageInfo.has_next_page).toBe(false)
  })
})
