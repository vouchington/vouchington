import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  processBackfillCategoriesForTopicAliases,
  processBackfillRssFeedCategoriesForTopicAlias,
  processReconcileRssFeedItemCategorySnapshots,
} from '../processors.mts'
import type { backfillCategoriesForTopicAliases } from '@services/rss-feed-items/categories'
import type { backfillCategoriesForTopicAlias } from '@services/rss-feeds/categories'
import type { enqueueContinueRssFeedItemCategorySnapshotReconciliation } from '@queues/rss-feed-item-categories/enqueues'
import type { reconcileRssFeedItemCategorySnapshots } from '@services/rss-feed-items/category-snapshot-reconciliations'

const mockBackfillCategoriesForTopicAlias = vi.fn<typeof backfillCategoriesForTopicAlias>()
const mockBackfillCategoriesForTopicAliases = vi.fn<typeof backfillCategoriesForTopicAliases>()
const mockEnqueueContinuation =
  vi.fn<typeof enqueueContinueRssFeedItemCategorySnapshotReconciliation>()
const mockReconcileSnapshots = vi.fn<typeof reconcileRssFeedItemCategorySnapshots>()

describe('rss feed item category processor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('backfills item categories for topic aliases', async () => {
    mockBackfillCategoriesForTopicAliases.mockResolvedValue({ updated: 2 })

    await expect(
      processBackfillCategoriesForTopicAliases(
        { topicId: 'topic-1' },
        { backfillCategoriesForTopicAliases: mockBackfillCategoriesForTopicAliases },
      ),
    ).resolves.toEqual({ updated: 2 })

    expect(mockBackfillCategoriesForTopicAliases).toHaveBeenCalledWith('topic-1')
  })

  it('backfills RSS feed categories for a topic alias', async () => {
    mockBackfillCategoriesForTopicAlias.mockResolvedValue(3)

    await expect(
      processBackfillRssFeedCategoriesForTopicAlias(
        { topicId: 'topic-2' },
        { backfillCategoriesForTopicAlias: mockBackfillCategoriesForTopicAlias },
      ),
    ).resolves.toBe(3)

    expect(mockBackfillCategoriesForTopicAlias).toHaveBeenCalledWith('topic-2')
  })

  it('enqueues an immediate serialized continuation after a full snapshot batch', async () => {
    mockReconcileSnapshots.mockResolvedValue({ reconciled: 25 })
    mockEnqueueContinuation.mockResolvedValue(undefined)

    await expect(
      processReconcileRssFeedItemCategorySnapshots(
        {},
        {
          enqueueContinueRssFeedItemCategorySnapshotReconciliation: mockEnqueueContinuation,
          reconcileRssFeedItemCategorySnapshots: mockReconcileSnapshots,
        },
      ),
    ).resolves.toEqual({ reconciled: 25 })

    expect(mockEnqueueContinuation).toHaveBeenCalledOnce()
  })

  it('does not enqueue a continuation after a partial snapshot batch', async () => {
    mockReconcileSnapshots.mockResolvedValue({ reconciled: 24 })

    await expect(
      processReconcileRssFeedItemCategorySnapshots(
        {},
        {
          enqueueContinueRssFeedItemCategorySnapshotReconciliation: mockEnqueueContinuation,
          reconcileRssFeedItemCategorySnapshots: mockReconcileSnapshots,
        },
      ),
    ).resolves.toEqual({ reconciled: 24 })

    expect(mockEnqueueContinuation).not.toHaveBeenCalled()
  })

  it('rejects when a full-batch continuation cannot be dispatched', async () => {
    const enqueueError = new Error('continuation unavailable')
    mockReconcileSnapshots.mockResolvedValue({ reconciled: 25 })
    mockEnqueueContinuation.mockRejectedValue(enqueueError)

    await expect(
      processReconcileRssFeedItemCategorySnapshots(
        {},
        {
          enqueueContinueRssFeedItemCategorySnapshotReconciliation: mockEnqueueContinuation,
          reconcileRssFeedItemCategorySnapshots: mockReconcileSnapshots,
        },
      ),
    ).rejects.toBe(enqueueError)
  })
})
