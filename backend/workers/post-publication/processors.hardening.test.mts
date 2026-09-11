import {
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  getTestPostPublicationDirtyWork,
  insertTestRssFeedItemSourceBatch,
  insertTestUrlDirect,
  listTestPostPublicationImpactRssFeedItemIds,
  beginTransaction,
} from '@voucha/test-helpers'
import {
  acknowledgePostPublicationDirtyWork,
  acknowledgePostPublicationProjectionReceipts,
  claimPostPublicationDirtyWork,
  deleteOrphanPostPublicationProjectionReceipts,
  POST_PUBLICATION_RECONCILIATION_PAGE_SIZE as PAGE_SIZE,
  reconcilePostPublicationDirtyWork,
  recordPostPublicationChange,
  releasePostPublicationDirtyWorkLease,
  renewPostPublicationDirtyWorkLease,
  updatePostPublicationDirtyWorkCursors,
  withPostPublicationReconciliationLock,
  withPostPublicationReconciliationLocks,
  type listAvailablePostPublicationDirtyWork,
} from '@services/post-publication'
import { describe, expect, it, vi } from 'vitest'
import { processReconcilePostPublication } from './processors.mts'
import { makeDependencies, makeResult, post } from './processors/test-helpers.mts'

describe('post publication orphan-receipt processor', () => {
  it('fans retained RSS items out to notification reconciliation', async () => {
    const rssFeedItemId = '00000000-0000-7000-8000-000000000010'
    const dependencies = makeDependencies(
      makeResult({ processed: 0, rssFeedItemIds: [rssFeedItemId] }),
    )

    await expect(processReconcilePostPublication({}, dependencies)).resolves.toEqual({
      reconciled: 0,
    })
    expect(dependencies.enqueueBulkReconcileRssFeedItemNotifications).toHaveBeenCalledWith([
      rssFeedItemId,
    ])
  })

  it('fans retained missing post targets out to notification cleanup', async () => {
    const missingPostId = '00000000-0000-7000-8000-000000000011'
    const dependencies = makeDependencies(
      makeResult({ processed: 0, posts: [], missingPostIds: [missingPostId] }),
    )

    await expect(processReconcilePostPublication({}, dependencies)).resolves.toEqual({
      reconciled: 0,
    })
    expect(dependencies.enqueueBulkReconcilePostNotifications).toHaveBeenCalledWith([missingPostId])
  })

  it('invalidates and refreshes retained missing post targets', async () => {
    const missingPostId = '00000000-0000-7000-8000-000000000012'
    const dependencies = makeDependencies(
      makeResult({ processed: 0, posts: [], missingPostIds: [missingPostId] }),
    )

    await expect(processReconcilePostPublication({}, dependencies)).resolves.toEqual({
      reconciled: 0,
    })

    expect(dependencies.invalidatePost).toHaveBeenCalledWith(missingPostId)
    expect(dependencies.invalidatePostPublicSurfaces).toHaveBeenCalledWith(
      { id: missingPostId, created_by_id: null, community_id: null },
      expect.any(Array),
    )
    expect(dependencies.enqueueBulkRefreshPostMetricsById).toHaveBeenCalledWith([missingPostId])
  })

  it('continues a bounded orphan-receipt page without acknowledging its work', async () => {
    const dependencies = makeDependencies(
      makeResult({
        processed: 0,
        posts: [],
        orphanReceiptPostIds: [post.id],
        hasMoreOrphanReceipts: true,
      }),
    )

    await expect(processReconcilePostPublication({}, dependencies)).resolves.toEqual({
      reconciled: 0,
    })

    expect(dependencies.enqueueContinuePostPublicationReconciliation).toHaveBeenCalledOnce()
    expect(dependencies.acknowledgePostPublicationDirtyWork).not.toHaveBeenCalled()
    expect(dependencies.updatePostPublicationDirtyWorkCursors).toHaveBeenCalledWith(
      expect.objectContaining({ id: expect.any(String), generation: expect.any(String) }),
      { postId: post.id },
    )
  })

  it('stops when orphan receipt deletion loses its fence', async () => {
    const dependencies = makeDependencies()
    dependencies.deleteOrphanPostPublicationProjectionReceipts.mockResolvedValueOnce(false)

    await expect(processReconcilePostPublication({}, dependencies)).resolves.toEqual({
      reconciled: 0,
    })
    expect(dependencies.renewPostPublicationDirtyWorkLease).not.toHaveBeenCalled()
  })

  it('stops when post and orphan cursor fences are stale', async () => {
    const postPage = makeDependencies(makeResult({ processed: 1, hasMorePosts: true }))
    postPage.updatePostPublicationDirtyWorkCursors.mockResolvedValueOnce(false)
    await expect(processReconcilePostPublication({}, postPage)).resolves.toEqual({ reconciled: 0 })

    const orphanPage = makeDependencies(
      makeResult({ processed: 0, posts: [], hasMoreOrphanReceipts: true }),
    )
    orphanPage.updatePostPublicationDirtyWorkCursors.mockResolvedValueOnce(false)
    await expect(processReconcilePostPublication({}, orphanPage)).resolves.toEqual({
      reconciled: 0,
    })
  })

  it('requires and fences the retained-key cursor', async () => {
    const missingCursor = makeDependencies(
      makeResult({ processed: 0, posts: [], hasMoreIdentityKeys: true, cursorKeyId: null }),
    )
    await expect(processReconcilePostPublication({}, missingCursor)).rejects.toThrow(
      'Publication key page requires a cursor key ID',
    )

    const keyPage = makeDependencies(
      makeResult({
        processed: 0,
        posts: [],
        hasMoreIdentityKeys: true,
        cursorKeyId: crypto.randomUUID(),
      }),
    )
    keyPage.updatePostPublicationDirtyWorkCursors.mockResolvedValueOnce(false)
    await expect(processReconcilePostPublication({}, keyPage)).resolves.toEqual({ reconciled: 0 })
  })
})

// The capture-time `identity_rss_feed` key sorts before every `impact_rss_feed_item` key
// materialized during the first reconcile pass (both are uuidv7-ordered, and the identity key
// commits first), so it consumes one slot of page 1 and none of the later pages.
const CAPTURE_KEY_COUNT = 1

describe('post publication RSS notification fanout', () => {
  it('drains impact_rss_feed_item keys across multiple reconciliation pages', async () => {
    const itemCount = PAGE_SIZE * 2 + 1
    const maxIterations = Math.ceil((itemCount + CAPTURE_KEY_COUNT) / PAGE_SIZE) + 2

    const user = await createTestUser()
    if (!user) throw new Error('Expected RSS fanout author fixture')
    const topic = await createTestTopic({ user })
    const rssFeedId = await createTestRssFeedWithTiming(topic.id)
    const url = await insertTestUrlDirect(
      user.id,
      `https://rss-fanout-${crypto.randomUUID().slice(0, 8)}.example.com`,
    )
    if (!url) throw new Error('Expected RSS fanout URL fixture')
    const itemIds = await insertTestRssFeedItemSourceBatch({
      count: itemCount,
      rssFeedId,
      urlId: url.id,
    })

    await using transaction = await beginTransaction()
    const work = await recordPostPublicationChange(transaction, {
      scope: { type: 'rss_feed', rssFeedId },
      reason: 'rss_feed_enablement_changed',
    })
    await transaction.commit()

    const dependencies = {
      ...makeDependencies(),
      // Read the fixture fresh on every iteration: a statically captured row would carry a stale
      // generation once the real cursor-update pass advances it, terminating the drain early.
      listAvailablePostPublicationDirtyWork: vi
        .fn<typeof listAvailablePostPublicationDirtyWork>()
        .mockImplementation(async () => {
          const row = await getTestPostPublicationDirtyWork(work.id)
          return row ? [row] : []
        }),
      claimPostPublicationDirtyWork,
      reconcilePostPublicationDirtyWork,
      updatePostPublicationDirtyWorkCursors,
      acknowledgePostPublicationProjectionReceipts,
      deleteOrphanPostPublicationProjectionReceipts,
      renewPostPublicationDirtyWorkLease,
      releasePostPublicationDirtyWorkLease,
      acknowledgePostPublicationDirtyWork,
      withPostPublicationReconciliationLock,
      withPostPublicationReconciliationLocks,
    }

    const observations = await drainRssFanout(work.id, dependencies, maxIterations)

    // 1. More keys than one page, and materialization is not double-inserted by the processor's
    // selection pass followed by its canonical pass.
    expect(observations[0].retainedCount).toBe(itemCount)

    // 2. Every continuation is processed until the work is acknowledged.
    expect(observations).toHaveLength(3)
    await expect(getTestPostPublicationDirtyWork(work.id)).resolves.toBeUndefined()

    // 3. Each item is enqueued exactly once; nothing is stranded, and no posts exist to notify.
    const enqueued = dependencies.enqueueBulkReconcileRssFeedItemNotifications.mock.calls.flatMap(
      ([ids]) => ids,
    )
    expect(enqueued).toHaveLength(itemCount)
    expect(new Set(enqueued).size).toBe(itemCount)
    expect(enqueued.toSorted()).toEqual(itemIds.toSorted())
    expect(dependencies.enqueueBulkReconcilePostNotifications).not.toHaveBeenCalled()

    // 4a. The retained-key cursor advances on RSS-only pages.
    const [firstObservation, secondObservation] = observations
    if (!firstObservation.cursorKeyId || !secondObservation.cursorKeyId)
      throw new Error('Expected a cursor key ID on both retained-key pages')
    expect(firstObservation.cursorKeyId.localeCompare(secondObservation.cursorKeyId)).toBeLessThan(
      0,
    )

    // 4b. Per-call batch sizes prove three real pages, not one page delivered in arbitrary
    // chunks: [page 1 minus the capture-time key, a full page, the remainder].
    const batchSizes = dependencies.enqueueBulkReconcileRssFeedItemNotifications.mock.calls.map(
      ([ids]) => ids.length,
    )
    expect(batchSizes).toEqual([
      PAGE_SIZE - CAPTURE_KEY_COUNT,
      PAGE_SIZE,
      itemCount - (2 * PAGE_SIZE - CAPTURE_KEY_COUNT),
    ])
  })
})

type RssFanoutObservation = { cursorKeyId: string | null; retainedCount: number }

async function drainRssFanout(
  dirtyWorkId: string,
  dependencies: Parameters<typeof processReconcilePostPublication>[1],
  maxIterations: number,
  observations: RssFanoutObservation[] = [],
): Promise<RssFanoutObservation[]> {
  if (observations.length >= maxIterations)
    throw new Error(`RSS fanout drain exceeded ${maxIterations} iterations`)
  await processReconcilePostPublication({}, dependencies)
  const [row, retained] = await Promise.all([
    getTestPostPublicationDirtyWork(dirtyWorkId),
    listTestPostPublicationImpactRssFeedItemIds(dirtyWorkId),
  ])
  const next = [
    ...observations,
    { cursorKeyId: row?.cursor_key_id ?? null, retainedCount: retained.length },
  ]
  return row ? drainRssFanout(dirtyWorkId, dependencies, maxIterations, next) : next
}
