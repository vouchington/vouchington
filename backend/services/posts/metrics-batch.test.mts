import { it, expect, describe } from 'vitest'
import { getPostMetricsByAnyBatch } from './metrics-batch.mts'
import {
  createTestUser,
  deleteTestPost,
  insertEntityRelation,
  insertTestPost,
  updatePostUpdatedAt,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { createPost } from './create.mts'
import type { PrivateUser } from '@services/users/types'

describe('metrics-batch', () => {
  it('getPostMetricsByAnyBatch returns empty array for empty input', async () => {
    const results = await getPostMetricsByAnyBatch([])
    expect(results).toEqual([])
  })

  it('getPostMetricsByAnyBatch fetches multiple post metrics by IDs in correct order', async () => {
    const user = (await createTestUser({ administrator: true })) as PrivateUser
    const post1 = await createPost(WEB_PROVENANCE, user, {
      post_type: 'discussion',
      title: 'Metrics Test 1',
      markdown: 'Content 1',
    })
    const post2 = await createPost(WEB_PROVENANCE, user, {
      post_type: 'discussion',
      title: 'Metrics Test 2',
      markdown: 'Content 2',
    })
    const post3 = await createPost(WEB_PROVENANCE, user, {
      post_type: 'discussion',
      title: 'Metrics Test 3',
      markdown: 'Content 3',
    })
    // Fetch in specific order
    const results = await getPostMetricsByAnyBatch([post2.id, post1.id, post3.id])

    expect(results).toHaveLength(3)
    expect(results[0]?.id).toBe(post2.id)
    expect(results[1]?.id).toBe(post1.id)
    expect(results[2]?.id).toBe(post3.id)
    // Verify metrics fields exist
    expect(results[0]).toHaveProperty('count')
    expect(results[0]?.count).toHaveProperty('descendants')
    expect(results[0]?.count).toHaveProperty('children')
    expect(results[0]?.count).toHaveProperty('ancestors')
    expect(results[0]).toHaveProperty('bookmarks')
  })

  it('excludes unpublished descendants from public batch counts and freshness', async () => {
    const user = (await createTestUser({ administrator: true })) as PrivateUser
    const random = Math.random().toString(36).slice(2, 15)
    const rootUpdatedAt = new Date('2026-02-01T00:00:00.000Z')
    const publishedUpdatedAt = new Date('2026-02-02T00:00:00.000Z')
    const unpublishedUpdatedAt = new Date('2026-02-03T00:00:00.000Z')
    const rootId = await insertTestPost({
      title: `Batch metrics root ${random}`,
      slug: `batch-metrics-root-${random}`,
      createdById: user.id,
      markdown: 'Root',
      createdAt: rootUpdatedAt,
    })
    const publishedId = await insertTestPost({
      title: '',
      slug: `batch-metrics-published-${random}`,
      createdById: user.id,
      markdown: 'Published comment',
      postType: 'comment',
      rootId,
      parentId: rootId,
      createdAt: publishedUpdatedAt,
    })
    const unpublishedId = await insertTestPost({
      title: '',
      slug: `batch-metrics-unpublished-${random}`,
      createdById: user.id,
      markdown: 'Unpublished comment',
      postType: 'comment',
      rootId,
      parentId: rootId,
      clearanceStatus: 'pending',
      createdAt: unpublishedUpdatedAt,
    })
    await Promise.all([
      updatePostUpdatedAt(rootId, rootUpdatedAt),
      updatePostUpdatedAt(publishedId, publishedUpdatedAt),
      updatePostUpdatedAt(unpublishedId, unpublishedUpdatedAt),
    ])

    const [metrics] = await getPostMetricsByAnyBatch([rootId])

    expect(metrics?.count).toMatchObject({ descendants: 1, children: 1 })
    expect(metrics?.updated_at).toEqual(publishedUpdatedAt)
  })

  it('uses the newest eligible descendant for freshness across child levels', async () => {
    const user = (await createTestUser({ administrator: true })) as PrivateUser
    const random = Math.random().toString(36).slice(2, 15)
    const rootUpdatedAt = new Date('2026-03-01T00:00:00.000Z')
    const childUpdatedAt = new Date('2026-03-02T00:00:00.000Z')
    const grandchildUpdatedAt = new Date('2026-03-03T00:00:00.000Z')
    const rootId = await insertTestPost({
      title: `Batch freshness root ${random}`,
      slug: `batch-freshness-root-${random}`,
      createdById: user.id,
      markdown: 'Root',
      createdAt: rootUpdatedAt,
    })
    const childId = await insertTestPost({
      title: '',
      slug: `batch-freshness-child-${random}`,
      createdById: user.id,
      markdown: 'Child',
      postType: 'comment',
      rootId,
      parentId: rootId,
      createdAt: childUpdatedAt,
    })
    const grandchildId = await insertTestPost({
      title: '',
      slug: `batch-freshness-grandchild-${random}`,
      createdById: user.id,
      markdown: 'Grandchild',
      postType: 'comment',
      rootId,
      parentId: childId,
      createdAt: grandchildUpdatedAt,
    })
    await Promise.all([
      updatePostUpdatedAt(rootId, rootUpdatedAt),
      updatePostUpdatedAt(childId, childUpdatedAt),
      updatePostUpdatedAt(grandchildId, grandchildUpdatedAt),
    ])

    const [metrics] = await getPostMetricsByAnyBatch([rootId])

    expect(metrics?.count).toMatchObject({ descendants: 2, children: 1 })
    expect(metrics?.updated_at).toEqual(grandchildUpdatedAt)
  })

  it('counts follow/save relations and preserves duplicate inputs', async () => {
    const owner = (await createTestUser({ administrator: true })) as PrivateUser
    const [follower1, follower2] = await Promise.all([createTestUser(), createTestUser()])
    if (!follower1 || !follower2) throw new Error('Failed to create bookmark users')
    const post = await createPost(WEB_PROVENANCE, owner, {
      post_type: 'discussion',
      title: 'Batch bookmark metrics',
      markdown: 'Content',
    })
    await Promise.all([
      insertEntityRelation('relation__user__follow__post', follower1.id, post.id),
      insertEntityRelation('relation__user__follow__post', follower2.id, post.id),
      insertEntityRelation('relation__user__save__post', follower1.id, post.id),
    ])

    const metrics = await getPostMetricsByAnyBatch([post.id, post.id])

    expect(metrics).toHaveLength(2)
    expect(metrics[0]?.bookmarks).toEqual({ follow: 2, save: 1 })
    expect(metrics[1]).toEqual(metrics[0])
  })

  it('counts only publicly eligible ancestors in batch metrics', async () => {
    const user = (await createTestUser({ administrator: true })) as PrivateUser
    const random = Math.random().toString(36).slice(2, 15)
    const rootId = await insertTestPost({
      title: `Batch ancestor root ${random}`,
      slug: `batch-ancestor-root-${random}`,
      createdById: user.id,
      markdown: 'Root',
    })
    const deletedParentId = await insertTestPost({
      title: '',
      slug: `batch-ancestor-deleted-${random}`,
      createdById: user.id,
      markdown: 'Deleted parent',
      postType: 'comment',
      rootId,
      parentId: rootId,
    })
    const childId = await insertTestPost({
      title: '',
      slug: `batch-ancestor-child-${random}`,
      createdById: user.id,
      markdown: 'Approved child',
      postType: 'comment',
      rootId,
      parentId: deletedParentId,
    })
    await deleteTestPost(deletedParentId)

    const [metrics] = await getPostMetricsByAnyBatch([childId])

    expect(metrics?.count.ancestors).toBe(1)
  })

  it('getPostMetricsByAnyBatch fetches by slugs', async () => {
    const user = (await createTestUser({ administrator: true })) as PrivateUser
    const slug1 = `metrics-slug-1-${Date.now()}-${Math.floor(Math.random() * 1000000)}`
    const slug2 = `metrics-slug-2-${Date.now()}-${Math.floor(Math.random() * 1000000)}`

    const post1 = await createPost(WEB_PROVENANCE, user, {
      post_type: 'discussion',
      title: 'Metrics Slug Test 1',
      markdown: 'Content 1',
      slug: slug1,
    })
    const post2 = await createPost(WEB_PROVENANCE, user, {
      post_type: 'discussion',
      title: 'Metrics Slug Test 2',
      markdown: 'Content 2',
      slug: slug2,
    })
    const results = await getPostMetricsByAnyBatch([slug2, slug1])

    expect(results).toHaveLength(2)
    expect(results[0]?.id).toBe(post2.id)
    expect(results[1]?.id).toBe(post1.id)
  })

  it('getPostMetricsByAnyBatch returns null for non-existent posts while preserving order', async () => {
    const user = (await createTestUser({ administrator: true })) as PrivateUser
    const post = await createPost(WEB_PROVENANCE, user, {
      post_type: 'discussion',
      title: 'Metrics Order Test',
      markdown: 'Content',
    })
    const results = await getPostMetricsByAnyBatch([
      '00000000-0000-0000-0000-000000000001',
      post.id,
    ])

    expect(results).toHaveLength(2)
    expect(results[0]).toBeNull()
    expect(results[1]?.id).toBe(post.id)
  })
})
