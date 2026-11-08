import { enqueuePostPublicationEffects } from '@queues/post-publication/enqueues'
import { enqueueBulkEvaluateRssFeedDiscoverability } from '@queues/rss-feed-maintenance/enqueues/discoverability'
import { listTopicPublicationFeedsPage } from '@services/post-publication/topic-feed-pages'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'
import { continuationJob } from './direct-continuations.mts'
import { enqueueLivePublicationIdentityEffects } from './direct-live-identities.mts'

type Continuation = NonNullable<PostPublicationEffectsJobData['continuation']>
type ApplyKeys = (
  data: PostPublicationEffectsJobData,
  keys: PostPublicationEffectsJobData['keys'],
  enqueueLivePages: boolean,
) => Promise<{ affectedPosts: number }>

export async function processTopicFeedContinuation(
  data: PostPublicationEffectsJobData,
  continuation: Continuation,
  applyKeys: ApplyKeys,
): Promise<{ affectedPosts: number }> {
  if (continuation.subjectIds.length === 0)
    throw new TypeError('Topic feed continuation has no subjects')
  const page = await listTopicPublicationFeedsPage(continuation.subjectIds, continuation.after)
  let result = { affectedPosts: 0 }
  if (continuation.kind === 'topic_feed_publication') {
    result = await applyKeys(
      data,
      page.ids.map(uuidValue => ({ kind: 'identity_rss_feed', uuidValue })),
      false,
    )
    await enqueueLivePublicationIdentityEffects(data, {
      postIds: [],
      topicIds: [],
      rssFeedIds: page.ids,
      rssFeedItemIds: [],
    })
  } else if (continuation.kind === 'topic_feed_discoverability') {
    await enqueueBulkEvaluateRssFeedDiscoverability(page.ids)
  } else throw new TypeError(`Unknown topic feed continuation: ${continuation.kind}`)
  if (page.hasMore)
    await enqueuePostPublicationEffects(
      continuationJob(data, { ...continuation, after: page.cursor }),
    )
  return result
}
