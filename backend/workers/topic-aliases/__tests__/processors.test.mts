import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestPost,
  createTestUser,
  createTopHashtagPostSourceForTest,
  insertTestRssFeed,
  insertTestTopic,
} from '@voucha/test-helpers'
import {
  getRssFeedItemCategories,
  upsertRssFeedItemCategories,
} from '@services/rss-feed-items/categories'
import { upsertRssFeedItems } from '@services/rss-feed-items/upsert'
import { createTopicAliases, unlinkTopicAlias } from '@services/topics/aliases'
import {
  processInvalidatePostsForTopicAliases,
  processReconcileTopicAliasCategoryMappings,
  processTopicAliasesUpdate,
} from '../processors.mts'
import type { enqueueContinueTopicAliasCategoryMappingReconciliation } from '@queues/topic-aliases/enqueues'
import type { processReconcileTopicAliasCategoryMappings as reconcileTopicAliasCategoryMappings } from '@services/rss-feeds/reconcile-topic-alias-category-mappings'
import { topicAliases } from '@queues/topic-aliases/queues'

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

    await expect(getRssFeedItemCategories(item!.id)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ topic_id: null })]),
    )
  })

  it('enqueues an immediate serialized continuation after a full reconciliation batch', async () => {
    mockReconcile.mockResolvedValue({ reconciled: 25, updated: 4 })
    mockEnqueueContinuation.mockResolvedValue(undefined)

    await expect(
      processReconcileTopicAliasCategoryMappings(
        {},
        {
          enqueueContinueTopicAliasCategoryMappingReconciliation: mockEnqueueContinuation,
          processReconcileTopicAliasCategoryMappings: mockReconcile,
        },
      ),
    ).resolves.toEqual({ reconciled: 25, updated: 4 })

    expect(mockEnqueueContinuation).toHaveBeenCalledOnce()
  })

  it('does not enqueue a continuation after a partial reconciliation batch', async () => {
    mockReconcile.mockResolvedValue({ reconciled: 24, updated: 4 })

    await expect(
      processReconcileTopicAliasCategoryMappings(
        {},
        {
          enqueueContinueTopicAliasCategoryMappingReconciliation: mockEnqueueContinuation,
          processReconcileTopicAliasCategoryMappings: mockReconcile,
        },
      ),
    ).resolves.toEqual({ reconciled: 24, updated: 4 })

    expect(mockEnqueueContinuation).not.toHaveBeenCalled()
  })

  it('rejects when a full-batch continuation cannot be dispatched', async () => {
    const enqueueError = new Error('continuation unavailable')
    mockReconcile.mockResolvedValue({ reconciled: 25, updated: 4 })
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
    const suffix = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Processor invalidation ${suffix}`,
      slug: `processor-invalidation-${suffix}`,
      createdById: user.id,
    })
    const [alias] = await createTopicAliases(topicId, `processor-invalidation-${suffix}`)
    const posts = await Promise.all(
      Array.from({ length: 101 }, (_, index) =>
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
      processInvalidatePostsForTopicAliases({ topicAliasIds: [alias!.id] }),
    ).resolves.toEqual({ hasMore: true, lastPostId: expect.any(String) })
    const continuation = (await topicAliases.getJobs('waiting')).find(
      job =>
        job.name === 'processInvalidatePostsForTopicAliases' &&
        (job.data as { topicAliasIds?: string[] }).topicAliasIds?.includes(alias!.id),
    )
    expect(continuation?.data).toEqual({
      afterPostId: expect.any(String),
      topicAliasIds: [alias!.id],
    })
  })
})
