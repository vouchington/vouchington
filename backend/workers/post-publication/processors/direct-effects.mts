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
  listLiveFeedCategoriesPage,
  listLiveFeedItemsPage,
  listLiveItemCategoriesPage,
} from '@services/post-publication/live-rss-feed-pages'
import {
  listLivePublicationIdentityNames,
  listLivePublicationScopeKeys,
} from '@services/post-publication/live-identity-pages'
import { reconcileReviewSuccessionsForPostIds } from '@services/posts/review-successions/index'
import {
  continuationJob,
  enqueueLivePublicationIdentityEffects,
  nextContinuation,
  processLivePublicationIdentityContinuation,
} from './direct-live-identities.mts'
import { enqueuePostPublicationEffects } from '@queues/post-publication/enqueues'
import {
  isTopicMergeContinuation,
  processLiveTopicMergeContinuation,
} from './direct-topic-merge-effects.mts'

type Continuation = NonNullable<PostPublicationEffectsJobData['continuation']>

/** Recomputes bounded effects from the captured preimage and primary live rows. */
export async function processApplyPostPublicationEffects(
  data: PostPublicationEffectsJobData,
): Promise<{ affectedPosts: number }> {
  if (data.continuation) {
    if (isTopicMergeContinuation(data.continuation.kind))
      return processLiveTopicMergeContinuation(data, data.continuation, processPublicationKeys)
    if (isRssContinuation(data.continuation.kind))
      return processLiveRssContinuation(data, data.continuation)
    await processLivePublicationIdentityContinuation(data)
    return { affectedPosts: 0 }
  }
  return processPublicationKeys(data, data.keys, true)
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
  const scopeKeys = await listLivePublicationScopeKeys(data.scope)
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
  if (enqueueLivePages)
    await enqueueLivePublicationIdentityEffects(
      data,
      {
        postIds: [...new Set([...postIds, ...currentPostIds])],
        topicIds: selected.topicIds,
        rssFeedIds,
        rssFeedItemIds: selected.rssFeedItemIds,
      },
      true,
    )
  return { affectedPosts: postIds.length }
}

function isRssContinuation(kind: Continuation['kind']): boolean {
  return (
    kind === 'rss_feed_items' ||
    kind === 'rss_feed_categories' ||
    kind === 'rss_feed_item_categories'
  )
}

/** Re-read one surviving RSS identity page without retaining a PostgreSQL projection cursor. */
async function processLiveRssContinuation(
  data: PostPublicationEffectsJobData,
  continuation: Continuation,
): Promise<{ affectedPosts: number }> {
  const subjectId = continuation.subjectIds[continuation.subjectIndex]
  if (!subjectId) throw new TypeError('RSS publication continuation has no current subject')
  let cursor: string | null
  let keys: PostPublicationEffectsJobData['keys']
  let itemIds: string[] = []
  let postIds: string[] = []
  if (continuation.kind === 'rss_feed_items') {
    const page = await listLiveFeedItemsPage(subjectId, continuation.after)
    cursor = page.cursor
    itemIds = page.itemIds
    postIds = page.postIds
    keys = [
      ...page.itemIds.map(uuidValue => ({ kind: 'impact_rss_feed_item' as const, uuidValue })),
      ...page.postIds.map(uuidValue => ({ kind: 'impact_post' as const, uuidValue })),
    ]
  } else if (continuation.kind === 'rss_feed_categories') {
    const page = await listLiveFeedCategoriesPage(subjectId, continuation.after)
    cursor = page.cursor
    keys = page.topicIds.map(uuidValue => ({ kind: 'impact_topic' as const, uuidValue }))
  } else if (continuation.kind === 'rss_feed_item_categories') {
    const page = await listLiveItemCategoriesPage(subjectId, continuation.after)
    cursor = page.cursor
    keys = [
      ...page.topicIds.map(uuidValue => ({ kind: 'impact_topic' as const, uuidValue })),
      ...page.aliases.map(textValue => ({ kind: 'identity_topic_alias' as const, textValue })),
    ]
  } else throw new TypeError(`Unknown RSS publication continuation: ${continuation.kind}`)

  const result = await processPublicationKeys(data, keys, false)
  // A source page can reveal a story post or a shared item's categories only after commit.
  // Their own bounded chains use this capture's stable change identity.
  if (itemIds.length > 0 || postIds.length > 0)
    await enqueueLivePublicationIdentityEffects(data, {
      postIds,
      topicIds: [],
      rssFeedIds: [],
      rssFeedItemIds: itemIds,
    })
  const next = nextContinuation(continuation, cursor)
  if (next) await enqueuePostPublicationEffects(continuationJob(data, next))
  return result
}
