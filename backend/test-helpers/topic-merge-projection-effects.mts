import { write } from '@data-stores/psql'
import { applyPostPublicationProjectionEffects } from '../workers/post-publication/processors/projection-effects.mts'
import { updateTopicRatingStats } from '../services/topics/ratings.mts'
import {
  invalidatePostStrict,
  invalidateUserStrict,
  invalidateCommunityStrict,
  invalidateRssFeedStrict,
} from '../services/entity-cache/invalidate-strict.mts'
import {
  invalidatePostPublicationTopicsStrict,
  invalidatePostPublicSurfacesStrict,
} from '../services/posts/public-surfaces.mts'
import {
  enqueueUpdateLandingPagesSitemapForReconciliation,
  enqueueUpdatePostDaySitemapForReconciliation,
} from '../queues/sitemaps/enqueues.mts'
import { enqueueRefreshTopHashtags } from '../queues/psql/enqueues.mts'
import { enqueueBulkRefreshPostMetricsById } from '../queues/vote-aggregation/enqueues/entity-metrics-cache-refresh.mts'

export async function seedStaleTopicMergeProjectionMetrics(destinationId: string): Promise<void> {
  await write(
    `/* seedStaleTopicMergeProjectionMetrics */ UPDATE topic_metrics SET ratings__count__5 = 99 WHERE topic_id = $1::uuid`,
    [destinationId],
  )
}

export async function applyTopicMergeProjectionEffects(topicIds: string[]): Promise<void> {
  await applyPostPublicationProjectionEffects(
    {
      posts: [],
      orphanReceiptPostIds: [],
      missingPostIds: [],
      topicIds,
      sitemapTargets: [],
      identityKeys: [],
    },
    {
      invalidatePost: invalidatePostStrict,
      invalidatePostPublicSurfaces: invalidatePostPublicSurfacesStrict,
      invalidatePostPublicationTopics: invalidatePostPublicationTopicsStrict,
      updateTopicRatingStats,
      enqueueUpdatePostDaySitemapForReconciliation,
      enqueueUpdateLandingPagesSitemapForReconciliation,
      enqueueRefreshTopHashtags,
      enqueueBulkRefreshPostMetricsById,
      invalidateUser: invalidateUserStrict,
      invalidateCommunity: invalidateCommunityStrict,
      invalidateRssFeed: invalidateRssFeedStrict,
    },
  )
}

export async function getTopicMergeProjectionMetrics(sourceId: string, destinationId: string) {
  const { rows } = await write<{ topic_id: string; ratings__count__5: number }>(
    `/* getTopicMergeProjectionMetrics */ SELECT topic_id, ratings__count__5 FROM topic_metrics WHERE topic_id = ANY($1::uuid[]) ORDER BY topic_id`,
    [[sourceId, destinationId]],
  )
  return rows
}
