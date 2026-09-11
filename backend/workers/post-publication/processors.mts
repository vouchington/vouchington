import { enqueueContinuePostPublicationReconciliation } from '@queues/post-publication/enqueues'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { enqueueUpdatePostDaySitemapForReconciliation } from '@queues/sitemaps/enqueues'
import { enqueueBulkRefreshPostMetricsById } from '@queues/entity-metrics-cache-refresh/enqueues'
import {
  enqueueBulkReconcilePostNotifications,
  enqueueBulkReconcileRssFeedItemNotifications,
} from '@queues/notifications/enqueues'
import { enqueuePostPublicationNotificationEffects } from './processors/notification-effects.mts'
import * as entityCache from '@services/entity-cache/invalidate-strict'
import {
  applyPostPublicationProjectionEffects,
  type PostPublicationProjectionEffectDependencies,
} from './processors/projection-effects.mts'
import { postPublicationScopeForWork } from './processors/scope.mts'
import {
  invalidatePostPublicationTopicsStrict,
  invalidatePostPublicSurfacesStrict,
} from '@services/posts/public-surfaces'
import { updateTopicRatingStats } from '@services/topics/ratings'
import { reconcileReviewSuccessionsForPostIds } from '@services/posts/review-successions/index'
import { reconcileReviewSuccessionBeforePostPublication } from './processors/review-succession.mts'
import {
  acknowledgePostPublicationDirtyWork,
  acknowledgePostPublicationProjectionReceipts,
  deleteOrphanPostPublicationProjectionReceipts,
  claimPostPublicationDirtyWork,
  listAvailablePostPublicationDirtyWork,
  reconcilePostPublicationDirtyWork,
  releasePostPublicationDirtyWorkLease,
  renewPostPublicationDirtyWorkLease,
  updatePostPublicationDirtyWorkCursors,
  withPostPublicationReconciliationLock,
  withPostPublicationReconciliationLocks,
  postPublicationScopeLockKey,
} from '@services/post-publication'
export { processShadowAuditPostPublication } from './processors/shadow-audit.mts'
export { processAuditReviewSuccessionHistory } from './processors/review-succession-history.mts'
const LEASE_SECONDS = 120
type ReconciliationLock<Key> = (key: Key, operation: () => Promise<void>) => Promise<void>
type PostPublicationProcessorDependencies = PostPublicationProjectionEffectDependencies & {
  listAvailablePostPublicationDirtyWork: typeof listAvailablePostPublicationDirtyWork
  claimPostPublicationDirtyWork: typeof claimPostPublicationDirtyWork
  reconcilePostPublicationDirtyWork: typeof reconcilePostPublicationDirtyWork
  reconcileReviewSuccessionsForPostIds: typeof reconcileReviewSuccessionsForPostIds
  withPostPublicationReconciliationLock: ReconciliationLock<string>
  withPostPublicationReconciliationLocks: ReconciliationLock<readonly string[]>
  enqueueBulkReconcilePostNotifications: typeof enqueueBulkReconcilePostNotifications
  enqueueBulkReconcileRssFeedItemNotifications: typeof enqueueBulkReconcileRssFeedItemNotifications
  acknowledgePostPublicationProjectionReceipts: typeof acknowledgePostPublicationProjectionReceipts
  deleteOrphanPostPublicationProjectionReceipts: typeof deleteOrphanPostPublicationProjectionReceipts
  renewPostPublicationDirtyWorkLease: typeof renewPostPublicationDirtyWorkLease
  updatePostPublicationDirtyWorkCursors: typeof updatePostPublicationDirtyWorkCursors
  acknowledgePostPublicationDirtyWork: typeof acknowledgePostPublicationDirtyWork
  enqueueContinuePostPublicationReconciliation: typeof enqueueContinuePostPublicationReconciliation
  releasePostPublicationDirtyWorkLease: typeof releasePostPublicationDirtyWorkLease
}
const defaultDependencies: PostPublicationProcessorDependencies = {
  listAvailablePostPublicationDirtyWork,
  claimPostPublicationDirtyWork,
  reconcilePostPublicationDirtyWork,
  reconcileReviewSuccessionsForPostIds,
  invalidatePost: entityCache.invalidatePostStrict,
  invalidatePostPublicSurfaces: invalidatePostPublicSurfacesStrict,
  invalidatePostPublicationTopics: invalidatePostPublicationTopicsStrict,
  withPostPublicationReconciliationLock,
  withPostPublicationReconciliationLocks,
  updateTopicRatingStats,
  enqueueUpdatePostDaySitemapForReconciliation,
  enqueueRefreshTopHashtags,
  enqueueBulkRefreshPostMetricsById,
  enqueueBulkReconcilePostNotifications,
  enqueueBulkReconcileRssFeedItemNotifications,
  acknowledgePostPublicationProjectionReceipts,
  deleteOrphanPostPublicationProjectionReceipts,
  renewPostPublicationDirtyWorkLease,
  updatePostPublicationDirtyWorkCursors,
  invalidateUser: entityCache.invalidateUserStrict,
  invalidateCommunity: entityCache.invalidateCommunityStrict,
  invalidateRssFeed: entityCache.invalidateRssFeedStrict,
  acknowledgePostPublicationDirtyWork,
  enqueueContinuePostPublicationReconciliation,
  releasePostPublicationDirtyWorkLease,
}
export async function processReconcilePostPublication(
  _data: Record<string, never>,
  dependencies: Partial<PostPublicationProcessorDependencies> = {},
): Promise<{ reconciled: number }> {
  const deps = { ...defaultDependencies, ...dependencies }
  const [available] = await deps.listAvailablePostPublicationDirtyWork(1)
  if (!available) return { reconciled: 0 }
  const work = await deps.claimPostPublicationDirtyWork(available, LEASE_SECONDS)
  if (!work) return { reconciled: 0 }
  const fence = { id: work.id, generation: work.generation, leaseToken: work.lease_token }
  let reconciled = 0
  try {
    const scope = postPublicationScopeForWork(work)
    await deps.withPostPublicationReconciliationLock(
      // Post work takes its capture lock below; reusing it here would deadlock across connections.
      work.post_id ? `post-publication-work:${work.id}` : postPublicationScopeLockKey(scope),
      async () => {
        const selected = await deps.reconcilePostPublicationDirtyWork(work)
        if (
          await reconcileReviewSuccessionBeforePostPublication(
            selected.posts.map(post => post.id),
            deps,
          )
        )
          return
        await deps.withPostPublicationReconciliationLocks(
          selected.posts.map(post => post.id),
          async () => {
            // Re-read canonical primary state after all sorted post locks are held.
            // ast-grep-ignore: no-three-sequential-awaits -- canonical reread, projection effects, and notification effects are ordered before receipt acknowledgement
            const result = await deps.reconcilePostPublicationDirtyWork(
              work,
              undefined,
              selected.posts.map(post => post.id),
            )
            await applyPostPublicationProjectionEffects(result, deps)
            await enqueuePostPublicationNotificationEffects(result, deps)
            if (!(await deps.acknowledgePostPublicationProjectionReceipts(work, result.posts)))
              return
            if (
              !(await deps.deleteOrphanPostPublicationProjectionReceipts(
                work,
                result.orphanReceiptPostIds,
              ))
            )
              return
            if (!(await deps.renewPostPublicationDirtyWorkLease(fence, LEASE_SECONDS))) return
            if (result.hasMorePosts) {
              await deps.enqueueContinuePostPublicationReconciliation()
              if (
                !(await deps.updatePostPublicationDirtyWorkCursors(fence, {
                  postId: result.cursorPostId,
                }))
              )
                return
            } else if (result.hasMoreOrphanReceipts) {
              await deps.enqueueContinuePostPublicationReconciliation()
              if (
                !(await deps.updatePostPublicationDirtyWorkCursors(fence, {
                  postId: result.cursorPostId,
                }))
              )
                return
            } else if (result.hasMoreTopics) {
              const topicId = result.topicIds.at(-1)
              if (!topicId) throw new TypeError('Publication topic page requires a cursor topic ID')
              await deps.enqueueContinuePostPublicationReconciliation()
              if (
                !(await deps.updatePostPublicationDirtyWorkCursors(fence, {
                  postId: result.cursorPostId,
                  topicId,
                }))
              )
                return
            } else if (result.hasMoreIdentityKeys) {
              if (!result.cursorKeyId)
                throw new TypeError('Publication key page requires a cursor key ID')
              await deps.enqueueContinuePostPublicationReconciliation()
              if (
                !(await deps.updatePostPublicationDirtyWorkCursors(fence, {
                  postId: result.cursorPostId,
                  ...(result.topicIds.length > 0 ? { topicId: result.topicIds.at(-1)! } : {}),
                  keyId: result.cursorKeyId,
                }))
              )
                return
            } else {
              await deps.enqueueContinuePostPublicationReconciliation()
              await deps.acknowledgePostPublicationDirtyWork(fence)
            }
            reconciled = result.processed
          },
        )
      },
    )
    return { reconciled }
  } finally {
    await deps.releasePostPublicationDirtyWorkLease(fence)
  }
}
