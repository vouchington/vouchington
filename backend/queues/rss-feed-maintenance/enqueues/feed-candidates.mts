import {
  createBulkEnqueueFunction,
  createEnqueueFunction,
  ENQUEUE_BASE_DEFAULTS,
} from '@data-stores/valkey-glide-mq'
import { getPostPublicationWorkLimit } from '@services/post-publication/work-limits'
import { rssFeedMaintenance } from '../queues.mts'
import { QUEUE_NAME, PRIORITY_DEFAULT, PRIORITY_RECOVERY } from '../config.mts'

export type FeedCandidateDispatch = { afterId?: string; throughId?: string; sweepId?: string }
export type FeedCandidatePage = { itemId: string; continuationKey?: string }

export function feedCandidateOrdering(dispatch = false) {
  return {
    key: dispatch ? 'rss-feed-candidates:dispatch' : 'rss-feed-candidates:pages',
    concurrency: getPostPublicationWorkLimit('rss_feed_candidate_concurrency'),
  }
}

export const enqueueBulkReconcileFeedCandidates = createBulkEnqueueFunction({
  queue: rssFeedMaintenance,
  queueName: QUEUE_NAME,
  jobName: 'processReconcileRssFeedItemCandidates',
  defaults: { ...ENQUEUE_BASE_DEFAULTS, removeOnComplete: true, removeOnFail: true },
  buildJob: (data: FeedCandidatePage) => ({
    data,
    opts: {
      jobId: `rss-feed-candidate__${data.itemId}__${data.continuationKey ?? 'recover'}`,
      deduplication: {
        id: `rss-feed-candidate__${data.itemId}__${data.continuationKey ?? 'recover'}`,
        mode: 'simple' as const,
      },
      ordering: feedCandidateOrdering(),
      priority: PRIORITY_DEFAULT,
    },
  }),
})

const enqueueDispatch = createEnqueueFunction<
  FeedCandidateDispatch,
  'dispatchRssFeedItemCandidates'
>({
  queue: rssFeedMaintenance,
  queueName: QUEUE_NAME,
  jobName: 'dispatchRssFeedItemCandidates',
  defaults: { ...ENQUEUE_BASE_DEFAULTS, removeOnComplete: true, removeOnFail: true },
})

export function enqueueDispatchFeedCandidates(data: FeedCandidateDispatch = {}) {
  return enqueueDispatch(data, {
    jobId: `rss-feed-candidates-dispatch__${data.sweepId ?? Math.floor(Date.now() / 60_000)}__${data.afterId ?? 'start'}`,
    ordering: feedCandidateOrdering(true),
    priority: PRIORITY_RECOVERY,
  })
}
