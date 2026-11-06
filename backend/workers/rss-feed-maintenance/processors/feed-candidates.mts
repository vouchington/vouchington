import type { Job } from 'glide-mq'
import {
  enqueueBulkReconcileFeedCandidates,
  enqueueDispatchFeedCandidates,
  type FeedCandidateDispatch,
  type FeedCandidatePage,
} from '@queues/rss-feed-maintenance/enqueues/feed-candidates'
import { getPostPublicationWorkLimit } from '@services/post-publication/work-limits'
import {
  getCandidateReconciliationUpperBound,
  getCandidateReconciliationPage,
} from '@services/rss-feed-items/candidate-reconciliation-state'
import { reconcileRssFeedItemCandidatePage } from '@services/rss-feed-items/reconcile-feed-candidate'

export async function dispatchFeedCandidates(job: Job<FeedCandidateDispatch>) {
  const throughId = job.data.throughId ?? (await getCandidateReconciliationUpperBound())
  if (!throughId) return { enqueued: 0 }
  const limit = getPostPublicationWorkLimit('rss_feed_candidate_dispatch_size')
  const ids = await getCandidateReconciliationPage({ afterId: job.data.afterId, throughId, limit })
  await enqueueBulkReconcileFeedCandidates(ids.map(itemId => ({ itemId })))
  if (ids.length === limit)
    await enqueueDispatchFeedCandidates({
      throughId,
      afterId: ids.at(-1),
      sweepId: job.data.sweepId ?? job.id,
    })
  return { enqueued: ids.length }
}

export async function processFeedCandidatePage(data: FeedCandidatePage) {
  const continuationKey = await reconcileRssFeedItemCandidatePage(data.itemId)
  if (continuationKey)
    await enqueueBulkReconcileFeedCandidates([{ itemId: data.itemId, continuationKey }])
  return { hasMore: continuationKey !== null }
}
