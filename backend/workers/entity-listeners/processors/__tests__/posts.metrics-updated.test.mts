import { it, expect, beforeAll, describe } from 'vitest'
import {
  createTestUser,
  deleteTestPost,
  insertTestPost,
  updatePostUpdatedAt,
} from '@voucha/test-helpers'
import { getPostMetricsByAny } from '@services/posts/metrics'
import { processPostCreated, processPostUpdated, processPostDeleted } from '../posts.mts'
import type { PrivateUser } from '@services/users/types'

describe('posts.metrics-updated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('post_metrics updates when comments are created, updated, and deleted', async () => {
    const postId = await insertTestPost({
      title: 'Metrics Root',
      slug: `metrics-root-${Date.now()}`,
      createdById: user.id,
      markdown: 'Root content',
    })
    const commentId = await insertTestPost({
      title: '',
      slug: `metrics-comment-${Date.now()}`,
      createdById: user.id,
      markdown: 'First comment',
      postType: 'comment',
      rootId: postId,
      parentId: postId,
    })
    await processPostCreated({ id: commentId })

    const afterCreate = await getPostMetricsByAny(postId)
    expect(afterCreate?.count.descendants).toBe(1)
    expect(afterCreate?.count.children).toBe(1)

    const previousUpdatedAt = afterCreate?.updated_at?.getTime() ?? 0
    await updatePostUpdatedAt(commentId, new Date(previousUpdatedAt + 1))
    await processPostUpdated({ id: commentId })

    const afterUpdate = await getPostMetricsByAny(postId)
    const nextUpdatedAt = afterUpdate?.updated_at?.getTime() ?? 0
    expect(nextUpdatedAt).toBeGreaterThan(previousUpdatedAt)

    await deleteTestPost(commentId)
    await processPostDeleted({ id: commentId })

    const afterDelete = await getPostMetricsByAny(postId)
    expect(afterDelete?.count.descendants).toBe(0)
    expect(afterDelete?.count.children).toBe(0)
  })
})
