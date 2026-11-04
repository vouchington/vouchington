import { describe, expect, it } from 'vitest'
import { createTestPost, createTestUser } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getCommentDescendantsPage } from './descendant-page.mts'
import { commentPlaceholderConfig } from './placeholder-config.mts'

describe('comment descendant page depth', () => {
  it('pages only within a depth window and starts a new one from a boundary permalink', async () => {
    const user = await createTestUser()
    const root = await createTestPost({ user })
    const first = await createTestPost({
      user,
      post_type: 'comment',
      parent_post_id: root.id,
      root_post_id: root.id,
    })
    const second = await createTestPost({
      user,
      post_type: 'comment',
      parent_post_id: first.id,
      root_post_id: root.id,
    })
    const third = await createTestPost({
      user,
      post_type: 'comment',
      parent_post_id: second.id,
      root_post_id: root.id,
    })
    const restore = overrideDynamicConfigFieldsForTest(commentPlaceholderConfig, {
      descendant_max_depth: 2,
    })
    try {
      const rootPost = { id: root.id, root_post_id: null }
      const fullWindow = await getCommentDescendantsPage(null, rootPost, { limit: 100 })
      expect(fullWindow.ids).toEqual([first.id, second.id])
      expect(fullWindow.pageInfo.has_next_page).toBe(false)

      const firstPage = await getCommentDescendantsPage(null, rootPost, { limit: 1 })
      expect(firstPage.ids).toEqual([first.id])
      expect(firstPage.pageInfo.has_next_page).toBe(true)
      expect(firstPage.pageInfo.end_cursor).toEqual(expect.any(String))

      const secondPage = await getCommentDescendantsPage(null, rootPost, {
        limit: 1,
        after: firstPage.pageInfo.end_cursor!,
      })
      expect(secondPage.ids).toEqual([second.id])
      expect(secondPage.pageInfo.has_next_page).toBe(false)
      expect(secondPage.pageInfo.end_cursor).toBeNull()

      const opened = await getCommentDescendantsPage(
        null,
        { id: second.id, root_post_id: root.id },
        { limit: 100 },
      )
      expect(opened.ids).toEqual([third.id])
      expect(opened.pageInfo.has_next_page).toBe(false)
    } finally {
      restore()
    }
  })
})
