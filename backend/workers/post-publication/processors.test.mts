import { describe, expect, it } from 'vitest'
import { processReconcilePostPublication } from './processors.mts'
import { makeDependencies, makeResult, post, work } from './processors/test-helpers.mts'

describe('post publication reconciliation processor', () => {
  it('acknowledges a short page and immediately continues to the next dirty-work scope', async () => {
    const dependencies = makeDependencies()

    await expect(processReconcilePostPublication({}, dependencies)).resolves.toEqual({
      reconciled: 1,
    })

    expect(dependencies.updateTopicRatingStats).toHaveBeenCalledWith(
      '00000000-0000-7000-8000-000000000006',
    )
    expect(dependencies.enqueueUpdatePostDaySitemapForReconciliation).toHaveBeenCalledWith(
      'discussion',
      '2026-09-01',
    )
    expect(dependencies.acknowledgePostPublicationDirtyWork).toHaveBeenCalledOnce()
    expect(dependencies.invalidateUser).toHaveBeenCalledWith('primary-author')
    expect(dependencies.updatePostPublicationDirtyWorkCursors).not.toHaveBeenCalled()
    expect(dependencies.enqueueContinuePostPublicationReconciliation).toHaveBeenCalledOnce()
    expect(dependencies.enqueueBulkReconcilePostNotifications).toHaveBeenCalledWith([post.id])
    expect(dependencies.enqueueBulkRefreshPostMetricsById).toHaveBeenCalledWith([post.id])
  })

  it('checkpoints and continues a full page without acknowledging its work', async () => {
    const dependencies = makeDependencies(
      makeResult({ processed: 100, posts: [post], hasMorePosts: true }),
    )

    await expect(processReconcilePostPublication({}, dependencies)).resolves.toEqual({
      reconciled: 100,
    })

    expect(dependencies.updatePostPublicationDirtyWorkCursors).toHaveBeenCalledWith(
      expect.objectContaining({ id: work.id, generation: work.generation }),
      { postId: post.id },
    )
    expect(dependencies.acknowledgePostPublicationDirtyWork).not.toHaveBeenCalled()
    expect(dependencies.enqueueContinuePostPublicationReconciliation).toHaveBeenCalledOnce()
  })

  it('does not advance or acknowledge post/topic work when its continuation or fence fails', async () => {
    const postPage = makeDependencies(
      makeResult({ processed: 100, posts: [post], hasMorePosts: true }),
    )
    const continuationError = new Error('continuation unavailable')
    postPage.enqueueContinuePostPublicationReconciliation.mockRejectedValueOnce(continuationError)

    await expect(processReconcilePostPublication({}, postPage)).rejects.toBe(continuationError)

    expect(postPage.updatePostPublicationDirtyWorkCursors).not.toHaveBeenCalled()
    expect(postPage.acknowledgePostPublicationDirtyWork).not.toHaveBeenCalled()

    const topicPage = makeDependencies({
      ...makeResult({ processed: 0, posts: [] }),
      hasMoreTopics: true,
    })
    topicPage.enqueueContinuePostPublicationReconciliation.mockRejectedValueOnce(continuationError)

    await expect(processReconcilePostPublication({}, topicPage)).rejects.toBe(continuationError)

    expect(topicPage.updatePostPublicationDirtyWorkCursors).not.toHaveBeenCalled()
    expect(topicPage.acknowledgePostPublicationDirtyWork).not.toHaveBeenCalled()
    const staleTopicFence = makeDependencies({
      ...makeResult({ processed: 0, posts: [] }),
      topicIds: ['00000000-0000-7000-8000-000000000006'],
      hasMoreTopics: true,
    })
    staleTopicFence.updatePostPublicationDirtyWorkCursors.mockResolvedValueOnce(false)
    await expect(processReconcilePostPublication({}, staleTopicFence)).resolves.toEqual({
      reconciled: 0,
    })
    expect(staleTopicFence.acknowledgePostPublicationDirtyWork).not.toHaveBeenCalled()
  })

  it('leaves work retryable when a projection enqueue fails', async () => {
    const dependencies = makeDependencies()
    const enqueueError = new Error('sitemap queue unavailable')
    dependencies.enqueueUpdatePostDaySitemapForReconciliation.mockRejectedValueOnce(enqueueError)

    await expect(processReconcilePostPublication({}, dependencies)).rejects.toBe(enqueueError)

    expect(dependencies.acknowledgePostPublicationProjectionReceipts).not.toHaveBeenCalled()
    expect(dependencies.acknowledgePostPublicationDirtyWork).not.toHaveBeenCalled()
    expect(dependencies.releasePostPublicationDirtyWorkLease).toHaveBeenCalledOnce()
  })

  it('keeps receipts and acknowledgement behind strict cache-tag and public-surface invalidation', async () => {
    const dependencies = makeDependencies({
      ...makeResult({ processed: 0, posts: [] }),
      identityKeys: [
        {
          id: '00000000-0000-7000-8000-000000000008',
          kind: 'community_slug',
          value: 'old-community',
        },
      ],
    })
    const strictError = new Error('strict public-surface invalidation rejected stale cache tags')
    dependencies.invalidateCommunity.mockRejectedValueOnce(strictError)

    await expect(processReconcilePostPublication({}, dependencies)).rejects.toBe(strictError)

    expect(dependencies.acknowledgePostPublicationProjectionReceipts).not.toHaveBeenCalled()
    expect(dependencies.acknowledgePostPublicationDirtyWork).not.toHaveBeenCalled()
    expect(dependencies.releasePostPublicationDirtyWorkLease).toHaveBeenCalledOnce()
  })

  it('drains only the current bounded retained-key page', async () => {
    const pageRssFeedId = '00000000-0000-7000-8000-000000000010'
    const dependencies = makeDependencies(
      makeResult({
        processed: 1,
        posts: [post],
        identityKeys: [{ id: pageRssFeedId, kind: 'rss_feed', value: pageRssFeedId }],
        hasMoreIdentityKeys: true,
        cursorKeyId: pageRssFeedId,
      }),
    )

    await expect(processReconcilePostPublication({}, dependencies)).resolves.toEqual({
      reconciled: 1,
    })

    expect(dependencies.invalidateRssFeed).toHaveBeenCalledOnce()
    expect(dependencies.invalidateRssFeed).toHaveBeenCalledWith(pageRssFeedId)
  })

  it('uses a distinct post-work scope lock before acquiring the post capture lock', async () => {
    const dependencies = makeDependencies()

    await expect(processReconcilePostPublication({}, dependencies)).resolves.toEqual({
      reconciled: 1,
    })

    expect(dependencies.withPostPublicationReconciliationLock).toHaveBeenCalledWith(
      `post-publication-work:${work.id}`,
      expect.any(Function),
    )
    expect(dependencies.withPostPublicationReconciliationLocks).toHaveBeenCalledWith(
      [post.id],
      expect.any(Function),
    )
  })

  it('uses the topic-alias scope lock for alias-owned dirty work', async () => {
    const aliasId = '00000000-0000-7000-8000-000000000007'
    const aliasWork = { ...work, post_id: null, topic_alias_id: aliasId }
    const dependencies = makeDependencies(makeResult({ processed: 0, posts: [] }))
    dependencies.listAvailablePostPublicationDirtyWork.mockResolvedValueOnce([aliasWork])
    dependencies.claimPostPublicationDirtyWork.mockResolvedValueOnce(aliasWork)

    await expect(processReconcilePostPublication({}, dependencies)).resolves.toEqual({
      reconciled: 0,
    })

    expect(dependencies.withPostPublicationReconciliationLock).toHaveBeenCalledWith(
      `topic_alias:${aliasId}`,
      expect.any(Function),
    )
  })

  it('uses the story scope lock for story-owned dirty work', async () => {
    const storyId = '00000000-0000-7000-8000-000000000007'
    const storyWork = { ...work, post_id: null, story_id: storyId }
    const dependencies = makeDependencies(makeResult({ processed: 0, posts: [] }))
    dependencies.listAvailablePostPublicationDirtyWork.mockResolvedValueOnce([storyWork])
    dependencies.claimPostPublicationDirtyWork.mockResolvedValueOnce(storyWork)

    await expect(processReconcilePostPublication({}, dependencies)).resolves.toEqual({
      reconciled: 0,
    })

    expect(dependencies.withPostPublicationReconciliationLock).toHaveBeenCalledWith(
      `story:${storyId}`,
      expect.any(Function),
    )
  })

  it('checkpoints the generic key UUID after draining a coalesced identity-key page', async () => {
    const keyId = '00000000-0000-7000-8000-000000000008'
    const dependencies = makeDependencies(
      makeResult({
        processed: 0,
        posts: [],
        identityKeys: [{ id: keyId, kind: 'post_slug', value: 'former-slug' }],
        hasMoreIdentityKeys: true,
        cursorKeyId: keyId,
      }),
    )

    await expect(processReconcilePostPublication({}, dependencies)).resolves.toEqual({
      reconciled: 0,
    })

    expect(dependencies.updatePostPublicationDirtyWorkCursors).toHaveBeenCalledWith(
      expect.objectContaining({ id: work.id, generation: work.generation }),
      { postId: post.id, topicId: '00000000-0000-7000-8000-000000000006', keyId },
    )
    expect(dependencies.acknowledgePostPublicationDirtyWork).not.toHaveBeenCalled()
  })

  it('persists completed post and topic phases before their continuations', async () => {
    const topicId = '00000000-0000-7000-8000-000000000007'
    const topicPage = makeDependencies(
      makeResult({ processed: 0, posts: [], topicIds: [topicId], hasMoreTopics: true }),
    )
    await processReconcilePostPublication({}, topicPage)
    expect(topicPage.updatePostPublicationDirtyWorkCursors).toHaveBeenCalledWith(
      expect.objectContaining({ id: work.id, generation: work.generation }),
      { postId: post.id, topicId },
    )

    const keyId = '00000000-0000-7000-8000-000000000008'
    const identityPage = makeDependencies(
      makeResult({
        processed: 0,
        posts: [],
        topicIds: [topicId],
        hasMoreIdentityKeys: true,
        cursorKeyId: keyId,
      }),
    )
    await processReconcilePostPublication({}, identityPage)
    expect(identityPage.updatePostPublicationDirtyWorkCursors).toHaveBeenCalledWith(
      expect.objectContaining({ id: work.id, generation: work.generation }),
      { postId: post.id, topicId, keyId },
    )
  })

  it('does not checkpoint or acknowledge when the receipt or lease fence is stale', async () => {
    const receiptStale = makeDependencies()
    receiptStale.acknowledgePostPublicationProjectionReceipts.mockResolvedValueOnce(false)

    await expect(processReconcilePostPublication({}, receiptStale)).resolves.toEqual({
      reconciled: 0,
    })

    expect(receiptStale.renewPostPublicationDirtyWorkLease).not.toHaveBeenCalled()
    expect(receiptStale.updatePostPublicationDirtyWorkCursors).not.toHaveBeenCalled()
    expect(receiptStale.acknowledgePostPublicationDirtyWork).not.toHaveBeenCalled()

    const leaseStale = makeDependencies()
    leaseStale.renewPostPublicationDirtyWorkLease.mockResolvedValueOnce(false)

    await expect(processReconcilePostPublication({}, leaseStale)).resolves.toEqual({
      reconciled: 0,
    })

    expect(leaseStale.updatePostPublicationDirtyWorkCursors).not.toHaveBeenCalled()
    expect(leaseStale.acknowledgePostPublicationDirtyWork).not.toHaveBeenCalled()
  })

  it('deletes receipt-only hard-delete tombstones after effects and before acknowledging', async () => {
    const dependencies = makeDependencies({
      ...makeResult({ processed: 0, posts: [] }),
      orphanReceiptPostIds: [post.id],
    })

    await expect(processReconcilePostPublication({}, dependencies)).resolves.toEqual({
      reconciled: 0,
    })

    expect(dependencies.deleteOrphanPostPublicationProjectionReceipts).toHaveBeenCalledWith(work, [
      post.id,
    ])
    expect(dependencies.invalidatePost).toHaveBeenCalledWith(post.id)
    expect(dependencies.invalidatePostPublicSurfaces).toHaveBeenCalledWith(
      { id: post.id, created_by_id: null, community_id: null },
      expect.any(Array),
    )
    expect(dependencies.enqueueBulkReconcilePostNotifications).toHaveBeenCalledWith([post.id])
    expect(dependencies.invalidatePost.mock.invocationCallOrder.at(-1)).toBeLessThan(
      dependencies.deleteOrphanPostPublicationProjectionReceipts.mock.invocationCallOrder[0]!,
    )
    expect(
      dependencies.deleteOrphanPostPublicationProjectionReceipts.mock.invocationCallOrder[0],
    ).toBeLessThan(dependencies.acknowledgePostPublicationDirtyWork.mock.invocationCallOrder[0]!)
  })
})
