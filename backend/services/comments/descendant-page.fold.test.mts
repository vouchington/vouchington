import { runWithCapturedQueries } from '@data-stores/psql/query-capture'
import { createTestPost, createTestUser, deleteTestPost } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { describe, expect, it } from 'vitest'
import { getCommentDescendantsPage } from './descendant-page.mts'
import { commentPlaceholderConfig } from './placeholder-config.mts'

describe('batched comment descendant previews', () => {
  it('folds sibling child probes and boundary look-downs into one query per stage', async () => {
    const user = await createTestUser()
    const root = await createTestPost({ user })
    const heads: string[] = []
    const boundaries: string[] = []
    for (let index = 0; index < 2; index += 1) {
      const head = await createTestPost({
        user,
        post_type: 'comment',
        parent_post_id: root.id,
        root_post_id: root.id,
      })
      const boundary = await createTestPost({
        user,
        post_type: 'comment',
        parent_post_id: head.id,
        root_post_id: root.id,
      })
      await createTestPost({
        user,
        post_type: 'comment',
        parent_post_id: boundary.id,
        root_post_id: root.id,
      })
      await deleteTestPost(boundary.id)
      heads.push(head.id)
      boundaries.push(boundary.id)
    }
    const restore = overrideDynamicConfigFieldsForTest(commentPlaceholderConfig, {
      descendant_max_depth: 2,
    })
    try {
      const captured = await runWithCapturedQueries(() =>
        getCommentDescendantsPage(null, { id: root.id, root_post_id: null }, { limit: 100 }),
      )
      expect(captured.result.ids).toEqual([...heads, ...boundaries].toSorted())
      expect(
        captured.queries.filter(query => query.text.includes('/* bounded-frontier */')),
      ).toHaveLength(1)
      expect(
        captured.queries.filter(query => query.text.includes('/* boundary-lookdown */')),
      ).toHaveLength(1)
    } finally {
      restore()
    }
  })

  it('continues after the emitted head when its preview fills the page', async () => {
    const user = await createTestUser()
    const root = await createTestPost({ user })
    const heads: Awaited<ReturnType<typeof createTestPost>>[] = []
    for (let index = 0; index < 3; index += 1)
      heads.push(
        await createTestPost({
          user,
          post_type: 'comment',
          parent_post_id: root.id,
          root_post_id: root.id,
        }),
      )
    const children: Awaited<ReturnType<typeof createTestPost>>[] = []
    for (let index = 0; index < 2; index += 1)
      children.push(
        await createTestPost({
          user,
          post_type: 'comment',
          parent_post_id: heads[0]!.id,
          root_post_id: root.id,
        }),
      )
    const post = { id: root.id, root_post_id: null }
    const first = await getCommentDescendantsPage(null, post, { limit: 3 })
    expect(first.ids).toEqual([heads[0]!.id, ...children.map(child => child.id)])
    expect(first.pageInfo.has_next_page).toBe(true)
    const second = await getCommentDescendantsPage(null, post, {
      limit: 3,
      after: first.pageInfo.end_cursor!,
    })
    expect(second.ids).toEqual([heads[1]!.id, heads[2]!.id])
    expect(second.pageInfo.has_next_page).toBe(false)
  })

  it('spends one per-head child budget across sibling parents', async () => {
    const user = await createTestUser()
    const root = await createTestPost({ user })
    const head = await createTestPost({
      user,
      post_type: 'comment',
      parent_post_id: root.id,
      root_post_id: root.id,
    })
    const children: Awaited<ReturnType<typeof createTestPost>>[] = []
    for (let index = 0; index < 2; index += 1)
      children.push(
        await createTestPost({
          user,
          post_type: 'comment',
          parent_post_id: head.id,
          root_post_id: root.id,
        }),
      )
    const grandchildren: Awaited<ReturnType<typeof createTestPost>>[] = []
    for (const child of children)
      grandchildren.push(
        await createTestPost({
          user,
          post_type: 'comment',
          parent_post_id: child.id,
          root_post_id: root.id,
        }),
      )
    const restore = overrideDynamicConfigFieldsForTest(commentPlaceholderConfig, {
      descendant_max_children_per_head: 3,
      descendant_max_rows: 3,
    })
    try {
      const page = await getCommentDescendantsPage(
        null,
        { id: root.id, root_post_id: null },
        { limit: 100 },
      )
      expect(page.ids).toEqual([head.id, children[0]!.id, children[1]!.id, grandchildren[0]!.id])
      const opened = await getCommentDescendantsPage(
        null,
        { id: children[1]!.id, root_post_id: root.id },
        { limit: 100 },
      )
      expect(opened.ids).toEqual([grandchildren[1]!.id])
    } finally {
      restore()
    }
  })
})
