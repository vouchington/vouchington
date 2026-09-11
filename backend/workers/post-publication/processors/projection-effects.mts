import type { enqueueBulkRefreshPostMetricsById } from '@queues/entity-metrics-cache-refresh/enqueues'
import type { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import type { enqueueUpdatePostDaySitemapForReconciliation } from '@queues/sitemaps/enqueues'
import type { invalidatePostStrict } from '@services/entity-cache/invalidate-strict'
import type {
  PublicationSitemapTarget,
  ReconciliationPost,
} from '@services/post-publication/reconcile'
import type {
  invalidatePostPublicationTopicsStrict,
  invalidatePostPublicSurfacesStrict,
} from '@services/posts/public-surfaces'
import type { updateTopicRatingStats } from '@services/topics/ratings'
import { applyPostPublicationIdentityEffects } from './identity-effects.mts'
import { invalidateReconciledPostSurfaces } from './post-invalidations.mts'

export type PostPublicationProjectionEffectDependencies = {
  invalidatePost: typeof invalidatePostStrict
  invalidatePostPublicSurfaces: typeof invalidatePostPublicSurfacesStrict
  invalidatePostPublicationTopics: typeof invalidatePostPublicationTopicsStrict
  updateTopicRatingStats: typeof updateTopicRatingStats
  enqueueUpdatePostDaySitemapForReconciliation: typeof enqueueUpdatePostDaySitemapForReconciliation
  enqueueRefreshTopHashtags: typeof enqueueRefreshTopHashtags
  enqueueBulkRefreshPostMetricsById: typeof enqueueBulkRefreshPostMetricsById
  invalidateUser: Parameters<typeof applyPostPublicationIdentityEffects>[1]['invalidateUser']
  invalidateCommunity: Parameters<
    typeof applyPostPublicationIdentityEffects
  >[1]['invalidateCommunity']
  invalidateRssFeed: Parameters<typeof applyPostPublicationIdentityEffects>[1]['invalidateRssFeed']
}

export async function applyPostPublicationProjectionEffects(
  result: {
    posts: ReconciliationPost[]
    orphanReceiptPostIds: string[]
    missingPostIds: string[]
    topicIds: string[]
    sitemapTargets: PublicationSitemapTarget[]
    identityKeys: Array<{ id: string; kind: string; value: string }>
  },
  deps: PostPublicationProjectionEffectDependencies,
): Promise<void> {
  const removedPostIds = [...new Set([...result.orphanReceiptPostIds, ...result.missingPostIds])]
  await Promise.all([
    invalidateReconciledPostSurfaces(
      result.posts,
      removedPostIds,
      result.topicIds,
      deps.invalidatePost,
      deps.invalidatePostPublicSurfaces,
    ),
    deps.invalidatePostPublicationTopics(...result.topicIds),
    applyPostPublicationIdentityEffects(result.identityKeys, {
      ...deps,
      invalidateTopic: deps.invalidatePostPublicationTopics,
    }),
  ])
  await Promise.all([
    ...result.topicIds.map(topicId => deps.updateTopicRatingStats(topicId)),
    ...result.sitemapTargets.map(target =>
      deps.enqueueUpdatePostDaySitemapForReconciliation(target.postType, target.day),
    ),
    deps.enqueueRefreshTopHashtags(),
    deps.enqueueBulkRefreshPostMetricsById([
      ...result.posts.map(post => post.id),
      ...result.missingPostIds,
    ]),
  ])
}
