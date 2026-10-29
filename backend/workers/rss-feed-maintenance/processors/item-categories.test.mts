import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  processBackfillCategoriesForTopicAliases,
  processBackfillRssFeedCategoriesForTopicAlias,
  processReconcileRssFeedItemCategorySnapshots,
} from './item-categories.mts'
import type {
  backfillTopicTextItemPage,
  backfillTopicTextFeedPage,
} from '@services/rss-feeds/topic-text-category-backfill'
import type { enqueueContinueRssFeedItemCategorySnapshotReconciliation } from '@queues/rss-feed-maintenance/enqueues/item-categories'
import type { reconcileRssFeedItemCategorySnapshots } from '@services/rss-feed-items/category-snapshot-reconciliations'

const mockBackfillTopicTextFeedPage = vi.fn<typeof backfillTopicTextFeedPage>()
const mockBackfillTopicTextItemPage = vi.fn<typeof backfillTopicTextItemPage>()
const mockEnqueueContinuation =
  vi.fn<typeof enqueueContinueRssFeedItemCategorySnapshotReconciliation>()
const mockReconcileSnapshots = vi.fn<typeof reconcileRssFeedItemCategorySnapshots>()

describe('rss feed item category processor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('backfills item categories for topic aliases', async () => {
    mockBackfillTopicTextItemPage.mockResolvedValue({ updated: 2, hasMore: false, cursor: null })

    await expect(
      processBackfillCategoriesForTopicAliases(
        { topicId: 'topic-1' },
        { backfillTopicTextItemPage: mockBackfillTopicTextItemPage },
      ),
    ).resolves.toEqual({ updated: 2, hasMore: false, cursor: null })

    expect(mockBackfillTopicTextItemPage).toHaveBeenCalledWith('topic-1', undefined)
  })

  it('backfills RSS feed categories for a topic alias', async () => {
    mockBackfillTopicTextFeedPage.mockResolvedValue({ updated: 3, hasMore: false, cursor: null })

    await expect(
      processBackfillRssFeedCategoriesForTopicAlias(
        { topicId: 'topic-2' },
        { backfillTopicTextFeedPage: mockBackfillTopicTextFeedPage },
      ),
    ).resolves.toEqual({ updated: 3, hasMore: false, cursor: null })

    expect(mockBackfillTopicTextFeedPage).toHaveBeenCalledWith('topic-2', undefined)
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
