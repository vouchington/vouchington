import { getTestRssFeedItemCategories } from '@voucha/test-helpers/entities/rss-feed-item-categories'
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  createTestPost,
  createTestUser,
  createTopHashtagPostSourceForTest,
  insertTestRssFeed,
  insertTestTopic,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { upsertRssFeedItemCategories } from '@services/rss-feed-items/categories'
import { upsertRssFeedItems } from '@services/rss-feed-items/upsert'
import { createTopicAliases, unlinkTopicAlias } from '@services/topics/aliases'
import {
  processInvalidatePostsForTopicAliases,
  processReconcileTopicAliasCategoryMappings,
  processTopicAliasesUpdate,
} from './topic-aliases.mts'
import type { enqueueContinueTopicAliasCategoryMappingReconciliation } from '@queues/rss-feed-maintenance/enqueues/topic-aliases'
import type { processReconcileTopicAliasCategoryMappings as reconcileTopicAliasCategoryMappings } from '@services/rss-feeds/reconcile-topic-alias-category-mappings'
import { rssFeedMaintenance } from '@queues/rss-feed-maintenance/queues'
import { notifications } from '@queues/notifications/queues'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { topicsWorkConfig } from '@services/topics/work-limits'

const mockEnqueueContinuation =
  vi.fn<typeof enqueueContinueTopicAliasCategoryMappingReconciliation>()
const mockReconcile = vi.fn<typeof reconcileTopicAliasCategoryMappings>()

describe('topic-aliases processors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('processTopicAliasesUpdate resolves without error for unknown topic', async () => {
    // Non-existent topicId: UPDATE queries affect 0 rows; backfill returns 0.
    await expect(
      processTopicAliasesUpdate({ topicId: '00000000-0000-0000-0000-000000000000' }),
    ).resolves.toBeUndefined()
  })

  it('passes removed alias identity through to RSS category cleanup', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Processor cleanup ${random}`,
      slug: `processor-cleanup-${random}`,
      createdById: user!.id,
    })
    const feedId = await insertTestRssFeed({ topicId, title: `Processor cleanup ${random}` })
    const [item] = await upsertRssFeedItems(feedId, [
      {
        link: `https://processor-cleanup-${random}.example.com/item`,
        guid: `processor-cleanup-${random}`,
        title: `Processor cleanup ${random}`,
      },
    ])
    const [alias] = await createTopicAliases(topicId, `processor-alias-${random}`)
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: item!.id, categories: [`#${alias!.alias}`] },
    ])
    await unlinkTopicAlias(alias!.id, { expectedTopicId: topicId, skipSideEffects: true })

    await processTopicAliasesUpdate({ topicId, removedTopicAliasId: alias!.id })

    await expect(getTestRssFeedItemCategories(item!.id)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ topic_id: null })]),
    )
  })

  it('enqueues an immediate serialized continuation after a full reconciliation batch', async () => {
    mockReconcile.mockResolvedValue({ reconciled: 25, updated: 4, hasMore: true })
    mockEnqueueContinuation.mockResolvedValue(undefined)

    await expect(
      processReconcileTopicAliasCategoryMappings(
        {},
        {
          enqueueContinueTopicAliasCategoryMappingReconciliation: mockEnqueueContinuation,
          processReconcileTopicAliasCategoryMappings: mockReconcile,
        },
      ),
    ).resolves.toEqual({ reconciled: 25, updated: 4, hasMore: true })

    expect(mockEnqueueContinuation).toHaveBeenCalledOnce()
  })

  it('does not enqueue a continuation after a partial reconciliation batch', async () => {
    mockReconcile.mockResolvedValue({ reconciled: 24, updated: 4, hasMore: false })

    await expect(
      processReconcileTopicAliasCategoryMappings(
        {},
        {
          enqueueContinueTopicAliasCategoryMappingReconciliation: mockEnqueueContinuation,
          processReconcileTopicAliasCategoryMappings: mockReconcile,
        },
      ),
    ).resolves.toEqual({ reconciled: 24, updated: 4, hasMore: false })

    expect(mockEnqueueContinuation).not.toHaveBeenCalled()
  })

  it('rejects when a full-batch continuation cannot be dispatched', async () => {
    const enqueueError = new Error('continuation unavailable')
    mockReconcile.mockResolvedValue({ reconciled: 25, updated: 4, hasMore: true })
    mockEnqueueContinuation.mockRejectedValue(enqueueError)

    await expect(
      processReconcileTopicAliasCategoryMappings(
        {},
        {
          enqueueContinueTopicAliasCategoryMappingReconciliation: mockEnqueueContinuation,
          processReconcileTopicAliasCategoryMappings: mockReconcile,
        },
      ),
    ).rejects.toBe(enqueueError)
  })

  it('persists a cursor continuation after processing a full alias post page', async () => {
    const restoreConfig = overrideDynamicConfigFieldsForTest(topicsWorkConfig, {
      alias_post_invalidation_batch_size: 3,
    })
    onTestFinished(restoreConfig)
    const suffix = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Processor invalidation ${suffix}`,
      slug: `processor-invalidation-${suffix}`,
      createdById: user.id,
    })
    const [alias] = await createTopicAliases(topicId, `processor-invalidation-${suffix}`)
    const posts = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        createTestPost({ user, title: `Processor invalidation ${index} ${suffix}` }),
      ),
    )
    await Promise.all(
      posts.map(post =>
        createTopHashtagPostSourceForTest({
          postId: post.id,
          topicAliasId: alias!.id,
          userId: user.id,
          authoredToken: `#processor-${suffix}`,
        }),
      ),
    )

    await expect(
      processInvalidatePostsForTopicAliases({ topicAliasIds: [alias!.id], changeId: alias!.id }),
    ).resolves.toEqual({ hasMore: true, lastPostId: expect.any(String) })
    const continuation = (await readAllQueueJobs(rssFeedMaintenance)).find(
      job =>
        job.name === 'processInvalidatePostsForTopicAliases' &&
        (job.data as { topicAliasIds?: string[] }).topicAliasIds?.includes(alias!.id),
    )
    expect(continuation?.data).toEqual({
      afterPostId: expect.any(String),
      topicAliasIds: [alias!.id],
      changeId: alias!.id,
    })
  })

  it('rejects a worker page when owned notification admission fails', async () => {
    const suffix = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Processor rejection ${suffix}`,
      slug: `processor-rejection-${suffix}`,
      createdById: user.id,
    })
    const [alias] = await createTopicAliases(topicId, `processor-rejection-${suffix}`)
    const post = await createTestPost({ user, title: `Processor rejection ${suffix}` })
    await createTopHashtagPostSourceForTest({
      postId: post.id,
      topicAliasId: alias!.id,
      userId: user.id,
      authoredToken: `#processor-${suffix}`,
    })
    const failure = new Error(`Owned worker notification admission failure ${suffix}`)
    const originalAddBulk = notifications.addBulk
    const addSpy = vi.spyOn(notifications, 'addBulk').mockImplementation(jobs => {
      if (
        jobs.some(
          job =>
            job.name === 'notifications.processReconcilePostNotifications' &&
            typeof job.data === 'object' &&
            job.data !== null &&
            'postId' in job.data &&
            job.data.postId === post.id,
        )
      )
        return Promise.reject(failure)
      return originalAddBulk.call(notifications, jobs)
    })
    try {
      await expect(
        processInvalidatePostsForTopicAliases({
          topicAliasIds: [alias!.id],
          changeId: randomUUID(),
        }),
      ).rejects.toBe(failure)
    } finally {
      addSpy.mockRestore()
    }
  })

  it('rejects a worker page when its owned continuation admission fails', async () => {
    const restoreConfig = overrideDynamicConfigFieldsForTest(topicsWorkConfig, {
      alias_post_invalidation_batch_size: 3,
    })
    onTestFinished(restoreConfig)
    const suffix = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Processor continuation ${suffix}`,
      slug: `processor-continuation-${suffix}`,
      createdById: user.id,
    })
    const [alias] = await createTopicAliases(topicId, `processor-continuation-${suffix}`)
    const posts = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        createTestPost({ user, title: `Processor continuation ${index} ${suffix}` }),
      ),
    )
    await Promise.all(
      posts.map(post =>
        createTopHashtagPostSourceForTest({
          postId: post.id,
          topicAliasId: alias!.id,
          userId: user.id,
          authoredToken: `#processor-${suffix}`,
        }),
      ),
    )
    const failure = new Error(`Owned worker continuation admission failure ${suffix}`)
    const originalAdd = rssFeedMaintenance.add
    const addSpy = vi.spyOn(rssFeedMaintenance, 'add').mockImplementation((name, data, options) => {
      if (
        name === 'processInvalidatePostsForTopicAliases' &&
        data &&
        typeof data === 'object' &&
        'topicAliasIds' in data &&
        Array.isArray(data.topicAliasIds) &&
        data.topicAliasIds.includes(alias!.id) &&
        'afterPostId' in data &&
        typeof data.afterPostId === 'string'
      )
        return Promise.reject(failure)
      return originalAdd.call(rssFeedMaintenance, name, data, options)
    })
    try {
      await expect(
        processInvalidatePostsForTopicAliases({
          topicAliasIds: [alias!.id],
          changeId: randomUUID(),
        }),
      ).rejects.toBe(failure)
    } finally {
      addSpy.mockRestore()
    }
  })
})
