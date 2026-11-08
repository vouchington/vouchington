import { enqueuePostPublicationEffects } from '@queues/post-publication/enqueues'
import { enqueueBulkEvaluateRssFeedDiscoverability } from '@queues/rss-feed-maintenance/enqueues/discoverability'
import { listTopicPublicationFeedsPage } from '@services/post-publication/topic-feed-pages'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'
import { continuationJob } from './direct-continuations.mts'

type Continuation = NonNullable<PostPublicationEffectsJobData['continuation']>

export async function processTopicFeedDiscoverability(
  data: PostPublicationEffectsJobData,
  continuation: Continuation,
): Promise<{ affectedPosts: number }> {
  const page = await listTopicPublicationFeedsPage(continuation.subjectIds, continuation.after)
  await enqueueBulkEvaluateRssFeedDiscoverability(page.ids)
  if (page.hasMore)
    await enqueuePostPublicationEffects(
      continuationJob(data, { ...continuation, after: page.cursor }),
    )
  return { affectedPosts: 0 }
}
