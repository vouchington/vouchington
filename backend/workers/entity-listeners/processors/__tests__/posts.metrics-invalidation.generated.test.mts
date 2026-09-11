import { it, expect, beforeAll, describe } from 'vitest'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import { getPostMetricsByAnyCached } from '@services/entity-fetch'
import { processPostCreated, processPostUpdated, processPostDeleted } from '../posts.mts'
import { caches } from '@services/entity-cache/caches'
import type { PrivateUser } from '@services/users/types'

describe('posts.metrics-invalidation.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('post_metrics cache is invalidated when a comment is created', async () => {
    // Create a parent post
    const parentPostId = await insertTestPost({
      title: 'Parent Post',
      slug: `parent-post-${Date.now()}`,
      createdById: user.id,
      markdown: 'Parent post content',
    })
    // Prime the cache by fetching metrics
    const initialMetrics = await getPostMetricsByAnyCached(parentPostId)
    expect(initialMetrics).toBeDefined()
    expect(initialMetrics!.count.children).toBe(0)

    // Verify the cache was populated
    let cachedValue = await caches.post_metrics.get(parentPostId)
    expect(cachedValue).toBeDefined()

    // Create a comment (post with root_id)
    const commentId = await insertTestPost({
      title: '',
      slug: `comment-${Date.now()}`,
      createdById: user.id,
      markdown: 'This is a comment',
      postType: 'comment',
      rootId: parentPostId,
      parentId: parentPostId,
    })
    // Trigger the listener
    await processPostCreated({ id: commentId })

    // Verify the cache was refreshed
    cachedValue = await caches.post_metrics.get(parentPostId)
    expect(cachedValue).toBeDefined()
    expect((cachedValue as any).count.children).toBe(1)
  })

  it('post_metrics cache is invalidated when a comment is updated', async () => {
    // Create a parent post
    const parentPostId = await insertTestPost({
      title: 'Parent Post for Update',
      slug: `parent-post-update-${Date.now()}`,
      createdById: user.id,
      markdown: 'Parent post content',
    })
    // Create a comment
    const commentId = await insertTestPost({
      title: '',
      slug: `comment-update-${Date.now()}`,
      createdById: user.id,
      markdown: 'This is a comment to update',
      postType: 'comment',
      rootId: parentPostId,
      parentId: parentPostId,
    })
    // Prime the cache by fetching metrics
    await getPostMetricsByAnyCached(parentPostId)

    // Verify the cache was populated
    let cachedValue = await caches.post_metrics.get(parentPostId)
    expect(cachedValue).toBeDefined()

    // Trigger the update listener
    await processPostUpdated({ id: commentId })

    // Verify the cache was refreshed
    cachedValue = await caches.post_metrics.get(parentPostId)
    expect(cachedValue).toBeDefined()
  })

  it('post_metrics cache is invalidated when a comment is deleted', async () => {
    // Create a parent post
    const parentPostId = await insertTestPost({
      title: 'Parent Post for Delete',
      slug: `parent-post-delete-${Date.now()}`,
      createdById: user.id,
      markdown: 'Parent post content',
    })
    // Create a comment
    const commentId = await insertTestPost({
      title: '',
      slug: `comment-delete-${Date.now()}`,
      createdById: user.id,
      markdown: 'This is a comment to delete',
      postType: 'comment',
      rootId: parentPostId,
      parentId: parentPostId,
    })
    // Prime the cache by fetching metrics
    await getPostMetricsByAnyCached(parentPostId)

    // Verify the cache was populated
    let cachedValue = await caches.post_metrics.get(parentPostId)
    expect(cachedValue).toBeDefined()

    // Trigger the delete listener (note: soft delete means post is still retrievable)
    await processPostDeleted({ id: commentId })

    // Verify the cache was refreshed
    cachedValue = await caches.post_metrics.get(parentPostId)
    expect(cachedValue).toBeDefined()
  })

  it('post_metrics cache is invalidated for all ancestors when a nested comment is created', async () => {
    const rootPostId = await insertTestPost({
      title: 'Root Post',
      slug: `root-post-${Date.now()}`,
      createdById: user.id,
      markdown: 'Root post content',
    })
    const parentCommentId = await insertTestPost({
      title: '',
      slug: `parent-comment-${Date.now()}`,
      createdById: user.id,
      markdown: 'Parent comment',
      postType: 'comment',
      rootId: rootPostId,
      parentId: rootPostId,
    })
    const childCommentId = await insertTestPost({
      title: '',
      slug: `child-comment-${Date.now()}`,
      createdById: user.id,
      markdown: 'Child comment',
      postType: 'comment',
      rootId: rootPostId,
      parentId: parentCommentId,
    })
    await getPostMetricsByAnyCached(rootPostId)
    await getPostMetricsByAnyCached(parentCommentId)

    let rootCachedValue = await caches.post_metrics.get(rootPostId)
    let parentCachedValue = await caches.post_metrics.get(parentCommentId)
    expect(rootCachedValue).toBeDefined()
    expect(parentCachedValue).toBeDefined()

    await processPostCreated({ id: childCommentId })

    rootCachedValue = await caches.post_metrics.get(rootPostId)
    parentCachedValue = await caches.post_metrics.get(parentCommentId)
    expect(rootCachedValue).toBeDefined()
    expect(parentCachedValue).toBeDefined()
  })

  it('post_metrics cache is NOT invalidated for non-comment posts', async () => {
    // Create a standalone post (not a comment)
    const standalonePostId = await insertTestPost({
      title: 'Standalone Post',
      slug: `standalone-post-${Date.now()}`,
      createdById: user.id,
      markdown: 'This is not a comment',
    })
    // Prime a different post's cache
    const otherPostId = await insertTestPost({
      title: 'Other Post',
      slug: `other-post-${Date.now()}`,
      createdById: user.id,
      markdown: 'Other post content',
    })
    await getPostMetricsByAnyCached(otherPostId)

    // Verify the other post's cache was populated
    let cachedValue = await caches.post_metrics.get(otherPostId)
    expect(cachedValue).toBeDefined()

    // Trigger the listener for the standalone post
    await processPostCreated({ id: standalonePostId })

    // Verify the other post's cache was NOT invalidated
    cachedValue = await caches.post_metrics.get(otherPostId)
    expect(cachedValue).toBeDefined()
  })
})
