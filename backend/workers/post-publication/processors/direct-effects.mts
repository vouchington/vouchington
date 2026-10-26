import { getPostPublicationWorkLimit } from '@services/post-publication/work-limits'
import { enqueuePostPublicationEffects } from '@queues/post-publication/enqueues'
import { isLiveRssContinuation, processLiveRssContinuation } from './direct-rss-effects.mts'
import {
  enqueueLiveScopePostEffects,
  isScopePostContinuation,
  processLiveScopePostContinuation,
} from './direct-scope-post-effects.mts'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import {
  enqueueUpdateLandingPagesSitemapForReconciliation,
  enqueueBulkUpdatePostDaySitemapsForReconciliation,
} from '@queues/sitemaps/enqueues'
import { enqueueBulkRefreshPostMetricsById } from '@queues/vote-aggregation/enqueues/entity-metrics-cache-refresh'
import { enqueueBulkUpdateTopicRatingStatsForTopicId } from '@queues/vote-aggregation/enqueues/topic-ratings'
import {
  enqueueBulkReconcilePostNotifications,
  enqueueBulkReconcileRssFeedItemNotifications,
} from '@queues/notifications/enqueues'
import { invalidateExactPublicationCacheKeys } from '@services/entity-cache/invalidate-publication-exact'
import { getCacheKeys } from '@services/entity-cache/keys'
import { selectDirectPublicationEffects } from '@services/post-publication/direct-effect-selection'
import { listLivePublicationPosts } from '@services/post-publication/live-publication-posts'
import {
  listLivePublicationIdentityNames,
  listLivePublicationScopeKeys,
} from '@services/post-publication/live-identity-pages'
import { reconcileReviewSuccessionsForPostIds } from '@services/posts/review-successions/index'
import {
  enqueueLivePublicationIdentityEffects,
  processLivePublicationIdentityContinuation,
} from './direct-live-identities.mts'
import {
  isTopicMergeContinuation,
  processLiveTopicMergeContinuation,
} from './direct-topic-merge-effects.mts'

/** Recomputes bounded effects from the captured preimage and primary live rows. */
export async function processApplyPostPublicationEffects(
  data: PostPublicationEffectsJobData,
): Promise<{ affectedPosts: number }> {
  if (data.continuation) {
    if (isScopePostContinuation(data.continuation.kind))
      return processLiveScopePostContinuation(data, data.continuation, processPublicationKeys)
    if (isTopicMergeContinuation(data.continuation.kind))
      return processLiveTopicMergeContinuation(data, data.continuation, processPublicationKeys)
    if (isLiveRssContinuation(data.continuation.kind))
      return processLiveRssContinuation(data, data.continuation, processPublicationKeys)
    await processLivePublicationIdentityContinuation(data)
    return { affectedPosts: 0 }
  }
  const limit = getPostPublicationWorkLimit('capture_batch_size')
  const end = data.keyOffset + limit
  const current = { ...data, postId: data.scopeStart ? data.postId : null }
  const result = await processPublicationKeys(current, data.keys.slice(data.keyOffset, end), true)
  if (data.scopeStart) await enqueueLiveScopePostEffects(current)
  if (end < data.keys.length)
    await enqueuePostPublicationEffects({ ...data, scopeStart: false, keyOffset: end })
  return result
}

async function processPublicationKeys(
  data: PostPublicationEffectsJobData,
  keys: PostPublicationEffectsJobData['keys'],
  enqueueLivePages: boolean,
): Promise<{ affectedPosts: number }> {
  const postIds = [
    ...new Set([
      ...(data.postId ? [data.postId] : []),
      ...keys.flatMap(key => (key.kind === 'impact_post' ? [key.uuidValue] : [])),
    ]),
  ]
  if (postIds.length > 0) await reconcileReviewSuccessionsForPostIds(postIds)
  const posts = await listLivePublicationPosts(postIds)
  const scopeKeys = data.scopeStart ? await listLivePublicationScopeKeys(data.scope) : []
  const selected = selectDirectPublicationEffects([...keys, ...scopeKeys], posts)
  const authorKeys: string[] = []
  const communityKeys: string[] = []
  const postSlugs: string[] = []
  const rssFeedIds: string[] = []
  const topicKeys = [...selected.topicIds]
  for (const key of selected.identityKeys) {
    if (key.kind === 'author') authorKeys.push(key.value)
    else if (key.kind === 'community' || key.kind === 'community_slug')
      communityKeys.push(key.value)
    else if (key.kind === 'post_slug') postSlugs.push(key.value)
    else if (key.kind === 'rss_feed') rssFeedIds.push(key.value)
    else if (key.kind === 'topic_alias') topicKeys.push(key.value)
  }
  const names = await listLivePublicationIdentityNames({
    userIds: [...getCacheKeys(authorKeys).ids],
    communityIds: [...getCacheKeys(communityKeys).ids],
    topicIds: selected.topicIds,
  })
  const currentPostIds = posts.flatMap(post =>
    [post.id, post.parent_post_id, post.root_post_id].filter((id): id is string => !!id),
  )
  await invalidateExactPublicationCacheKeys({
    postIds: [...new Set([...postIds, ...currentPostIds])],
    postSlugs,
    userKeys: [...new Set([...authorKeys, ...names.usernames])],
    communityKeys: [...new Set([...communityKeys, ...names.communitySlugs])],
    rssFeedIds,
    rssFeedItemIds: selected.rssFeedItemIds,
    topicKeys: [...new Set([...topicKeys, ...names.topicSlugs])],
  })
  await enqueueBulkUpdateTopicRatingStatsForTopicId(selected.topicIds)
  await Promise.all([
    enqueueBulkUpdatePostDaySitemapsForReconciliation(selected.sitemapTargets),
    enqueueRefreshTopHashtags(),
    enqueueBulkRefreshPostMetricsById([...new Set([...postIds, ...currentPostIds])]),
    postIds.length > 0 ? enqueueBulkReconcilePostNotifications(postIds) : Promise.resolve(),
    selected.rssFeedItemIds.length > 0
      ? enqueueBulkReconcileRssFeedItemNotifications(selected.rssFeedItemIds)
      : Promise.resolve(),
  ])
  if (selected.sitemapTargets.some(target => target.postType === 'review'))
    await enqueueUpdateLandingPagesSitemapForReconciliation()
  if (enqueueLivePages || selected.topicIds.length > 0)
    await enqueueLivePublicationIdentityEffects(
      data,
      {
        postIds: enqueueLivePages ? [...new Set([...postIds, ...currentPostIds])] : [],
        descendantPostIds: enqueueLivePages ? postIds : [],
        // Explicit topic keys are globally unique before capture splitting. The alias/feed
        // producer owns both old and new topic footprints; live scope keys still invalidate now.
        topicIds: [
          ...new Set([
            ...keys.flatMap(key => (key.kind === 'impact_topic' ? [key.uuidValue] : [])),
            ...(!data.scopeTopicKeysCaptured
              ? scopeKeys.flatMap(key => (key.kind === 'impact_topic' ? [key.uuidValue] : []))
              : []),
          ]),
        ],
        rssFeedIds: enqueueLivePages ? rssFeedIds : [],
        rssFeedItemIds: enqueueLivePages ? selected.rssFeedItemIds : [],
      },
      enqueueLivePages && data.scopeStart,
    )
  return { affectedPosts: postIds.length }
}
