import { describe, expect, it } from 'vitest'
import { createTestPost, createTestUser, deleteTestPost } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getCommentDescendantsPage } from './descendant-page.mts'
import { commentPlaceholderConfig } from './placeholder-config.mts'

describe('comment descendant page depth', () => {
  it('previews a bounded depth and restarts from a returned comment', async () => {
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
    expect(firstPage.pageInfo.has_next_page).toBe(false)

    const opened = await getCommentDescendantsPage(
      null,
      { id: ids[5]!, root_post_id: root.id },
      { limit: 100 },
    )
    expect(opened.ids).toEqual([ids[6], ids[7]])
    expect(opened.pageInfo.has_next_page).toBe(false)
  })

  it('advances past a filtered head on an empty page without skipping the next sibling', async () => {
    const user = await createTestUser()
    const root = await createTestPost({ user })
    const empty = await createTestPost({
      user,
      post_type: 'comment',
      parent_post_id: root.id,
      root_post_id: root.id,
    })
    const visible = await createTestPost({
      user,
      post_type: 'comment',
      parent_post_id: root.id,
      root_post_id: root.id,
    })
    await deleteTestPost(empty.id)
    const restore = overrideDynamicConfigFieldsForTest(commentPlaceholderConfig, {
      descendant_max_heads: 1,
    })
    try {
      const post = { id: root.id, root_post_id: null }
      const first = await getCommentDescendantsPage(null, post, { limit: 2 })
      expect(first.ids).toEqual([])
      expect(first.pageInfo.has_next_page).toBe(true)
      expect(first.pageInfo.end_cursor).toEqual(expect.any(String))

      const second = await getCommentDescendantsPage(null, post, {
        limit: 2,
        after: first.pageInfo.end_cursor!,
      })
      expect(second.ids).toEqual([visible.id])
      expect(second.pageInfo.has_next_page).toBe(false)
    } finally {
      restore()
    }
  })

  it('caps child previews per head while allowing a new window from the returned parent', async () => {
    const user = await createTestUser()
    const root = await createTestPost({ user })
    const first = await createTestPost({
      user,
      post_type: 'comment',
      parent_post_id: root.id,
      root_post_id: root.id,
    })
    const child = await createTestPost({
      user,
      post_type: 'comment',
      parent_post_id: first.id,
      root_post_id: root.id,
    })
    const grandchild = await createTestPost({
      user,
      post_type: 'comment',
      parent_post_id: child.id,
      root_post_id: root.id,
    })
    const restore = overrideDynamicConfigFieldsForTest(commentPlaceholderConfig, {
      descendant_max_children_per_head: 1,
    })
    try {
      const page = await getCommentDescendantsPage(
        null,
        { id: root.id, root_post_id: null },
        {
          limit: 100,
        },
      )
      expect(page.ids).toEqual([first.id, child.id])
      expect(page.pageInfo.has_next_page).toBe(false)
      const opened = await getCommentDescendantsPage(
        null,
        { id: child.id, root_post_id: root.id },
        { limit: 100 },
      )
      expect(opened.ids).toEqual([grandchild.id])
    } finally {
      restore()
    }
  })

  it('charges a filtered child to the per-head read cap and reaches its later sibling by cursor', async () => {
    const user = await createTestUser()
    const root = await createTestPost({ user })
    const head = await createTestPost({
      user,
      post_type: 'comment',
      parent_post_id: root.id,
      root_post_id: root.id,
    })
    const emptyDeleted = await createTestPost({
      user,
      post_type: 'comment',
      parent_post_id: head.id,
      root_post_id: root.id,
    })
    const visible = await createTestPost({
      user,
      post_type: 'comment',
      parent_post_id: head.id,
      root_post_id: root.id,
    })
    await deleteTestPost(emptyDeleted.id)
    const restore = overrideDynamicConfigFieldsForTest(commentPlaceholderConfig, {
      descendant_max_heads: 1,
      descendant_max_children_per_head: 1,
    })
    try {
      const rootPage = await getCommentDescendantsPage(
        null,
        { id: root.id, root_post_id: null },
        { limit: 3 },
      )
      expect(rootPage.ids).toEqual([head.id])

      const opened = { id: head.id, root_post_id: root.id }
      const firstChildPage = await getCommentDescendantsPage(null, opened, { limit: 3 })
      expect(firstChildPage.ids).toEqual([])
      expect(firstChildPage.pageInfo.has_next_page).toBe(true)
      expect(firstChildPage.pageInfo.end_cursor).toEqual(expect.any(String))

      const secondChildPage = await getCommentDescendantsPage(null, opened, {
        limit: 3,
        after: firstChildPage.pageInfo.end_cursor!,
      })
      expect(secondChildPage.ids).toEqual([visible.id])
      expect(secondChildPage.pageInfo.has_next_page).toBe(false)
    } finally {
      restore()
    }
  })

  it('resumes after the inspected head when its preview includes a newer child', async () => {
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
      parent_post_id: root.id,
      root_post_id: root.id,
    })
    const newerChild = await createTestPost({
      user,
      post_type: 'comment',
      parent_post_id: first.id,
      root_post_id: root.id,
    })
    const restore = overrideDynamicConfigFieldsForTest(commentPlaceholderConfig, {
      descendant_max_heads: 1,
    })
    try {
      const post = { id: root.id, root_post_id: null }
      const firstPage = await getCommentDescendantsPage(null, post, { limit: 3 })
      expect(firstPage.ids).toEqual([first.id, newerChild.id])
      expect(firstPage.pageInfo.has_next_page).toBe(true)

      const secondPage = await getCommentDescendantsPage(null, post, {
        limit: 3,
        after: firstPage.pageInfo.end_cursor!,
      })
      expect(secondPage.ids).toEqual([second.id])
      expect(secondPage.pageInfo.has_next_page).toBe(false)
    } finally {
      restore()
    }
  })
})
