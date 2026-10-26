import { enqueuePostPublicationEffects } from '@queues/post-publication/enqueues'
import {
  listLiveItemSourceFeedsPage,
  listLiveTopicMergeFeedsPage,
  listLiveTopicMergeItemsPage,
  listLiveTopicMergePostsPage,
} from '@services/post-publication/live-topic-merge-pages'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'
import {
  continuationJob,
  enqueueLivePublicationIdentityEffects,
  enqueueSubjectChains,
  nextContinuation,
} from './direct-live-identities.mts'

type Continuation = NonNullable<PostPublicationEffectsJobData['continuation']>
type ApplyKeys = (
  data: PostPublicationEffectsJobData,
  keys: PostPublicationEffectsJobData['keys'],
  enqueueLivePages: boolean,
) => Promise<{ affectedPosts: number }>

export function isTopicMergeContinuation(kind: Continuation['kind']): boolean {
  return (
    kind === 'topic_merge_posts' ||
    kind === 'topic_merge_feeds' ||
    kind === 'topic_merge_items' ||
    kind === 'topic_merge_item_sources'
  )
}

/** Rebuilds one destination topic's surviving post, feed, or item source page. */
export async function processLiveTopicMergeContinuation(
  data: PostPublicationEffectsJobData,
  continuation: Continuation,
  applyKeys: ApplyKeys,
): Promise<{ affectedPosts: number }> {
  const subjectId = continuation.subjectIds[continuation.subjectIndex]
  if (!subjectId) throw new TypeError('Topic merge continuation has no subject')
  const page =
    continuation.kind === 'topic_merge_posts'
      ? await listLiveTopicMergePostsPage(subjectId, continuation.after)
      : continuation.kind === 'topic_merge_feeds'
        ? await listLiveTopicMergeFeedsPage(subjectId, continuation.after)
        : continuation.kind === 'topic_merge_items'
          ? await listLiveTopicMergeItemsPage(subjectId, continuation.after)
          : await listLiveItemSourceFeedsPage(subjectId, continuation.after)
  const postIds = continuation.kind === 'topic_merge_posts' ? page.ids : []
  const itemIds = continuation.kind === 'topic_merge_items' ? page.ids : []
  const feedIds =
    continuation.kind === 'topic_merge_feeds' || continuation.kind === 'topic_merge_item_sources'
      ? page.ids
      : []
  const keys = [
    ...postIds.map(uuidValue => ({ kind: 'impact_post' as const, uuidValue })),
    ...itemIds.map(uuidValue => ({ kind: 'impact_rss_feed_item' as const, uuidValue })),
    ...feedIds.map(uuidValue => ({ kind: 'identity_rss_feed' as const, uuidValue })),
  ]
  const result = await applyKeys(data, keys, false)
  if (postIds.length > 0 || itemIds.length > 0 || feedIds.length > 0)
    await enqueueLivePublicationIdentityEffects(data, {
      postIds,
      topicIds: [],
      rssFeedIds: feedIds,
      rssFeedItemIds: itemIds,
    })
  if (itemIds.length > 0) await enqueueSubjectChains(data, 'topic_merge_item_sources', itemIds)
  const next = nextContinuation(continuation, page.cursor)
  if (next) await enqueuePostPublicationEffects(continuationJob(data, next))
  return result
}
