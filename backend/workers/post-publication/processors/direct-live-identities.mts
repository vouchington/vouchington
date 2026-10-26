import { hashCapturedPublicationKeys } from '@services/post-publication/captured-keys'
import { continuationJob, nextContinuation, subjectChainJobs } from './direct-continuations.mts'
import {
  enqueueBulkPostPublicationEffects,
  enqueuePostPublicationEffects,
} from '@queues/post-publication/enqueues'
import { enqueueBulkUpdateTopicRatingStatsForTopicId } from '@queues/vote-aggregation/enqueues/topic-ratings'
import { invalidateExactPublicationCacheKeys } from '@services/entity-cache/invalidate-publication-exact'
import {
  listLivePublicationIdentityNames,
  listLiveTopicAliasesPage,
} from '@services/post-publication/live-identity-pages'
import { listLivePostSlugsPage } from '@services/post-publication/live-post-slug-pages'
import { listLiveTopicMergedSourcesPage } from '@services/post-publication/live-topic-merged-source-pages'
import {
  LIVE_POST_TOPIC_FAMILIES,
  listLivePostTopicPage,
  type LivePostTopicFamily,
} from '@services/post-publication/live-post-topic-pages'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'

type Continuation = NonNullable<PostPublicationEffectsJobData['continuation']>

/** Starts bounded UUID lists; each continuation reads one indexed identity page. */
export async function enqueueLivePublicationIdentityEffects(
  data: PostPublicationEffectsJobData,
  subjects: {
    postIds: readonly string[]
    descendantPostIds?: readonly string[]
    topicIds: readonly string[]
    rssFeedIds: readonly string[]
    rssFeedItemIds: readonly string[]
  },
  includeTopicMerge = false,
): Promise<void> {
  const jobs = [
    ...subjectChainJobs(data, 'post_slugs', subjects.postIds),
    ...subjectChainJobs(data, 'post_descendants', subjects.descendantPostIds ?? []),
    ...topicIdentityJobs(data, subjects.topicIds),
    ...subjectChainJobs(data, 'rss_feed_items', subjects.rssFeedIds),
    ...subjectChainJobs(data, 'rss_feed_categories', subjects.rssFeedIds),
    ...subjectChainJobs(data, 'rss_feed_item_categories', subjects.rssFeedItemIds),
  ]
  if (includeTopicMerge && data.scope.type === 'topic') {
    jobs.push(...subjectChainJobs(data, 'topic_merge_posts', [data.scope.id]))
    jobs.push(...subjectChainJobs(data, 'topic_merge_feeds', [data.scope.id]))
    jobs.push(...subjectChainJobs(data, 'topic_merge_items', [data.scope.id]))
  }
  for (const family of LIVE_POST_TOPIC_FAMILIES)
    jobs.push(...subjectChainJobs(data, family, subjects.postIds))
  await enqueueBulkPostPublicationEffects(jobs)
}

/** One live slug/alias page; the next job carries only its bounded UUID list and cursor. */
export async function processLivePublicationIdentityContinuation(
  data: PostPublicationEffectsJobData,
): Promise<void> {
  const continuation = data.continuation
  if (!continuation) throw new TypeError('Publication continuation payload is required')
  const subjectId = continuation.subjectIds[continuation.subjectIndex]
  if (!subjectId) throw new TypeError('Publication continuation has no current subject')
  if (continuation.kind === 'topic_merged_sources') {
    const page = await listLiveTopicMergedSourcesPage(subjectId, continuation.after)
    await Promise.all([
      invalidateExactPublicationCacheKeys({
        postIds: [],
        postSlugs: [],
        userKeys: [],
        communityKeys: [],
        rssFeedIds: [],
        rssFeedItemIds: [],
        topicKeys: [...page.ids, ...page.slugs],
      }),
      enqueueBulkPostPublicationEffects(topicIdentityJobs(data, page.ids, ['topic_aliases'])),
    ])
    const next = nextContinuation(continuation, page.cursor)
    if (next) await enqueuePostPublicationEffects(continuationJob(data, next))
    return
  }
  if (LIVE_POST_TOPIC_FAMILIES.includes(continuation.kind as LivePostTopicFamily)) {
    const page = await listLivePostTopicPage(
      subjectId,
      continuation.kind as LivePostTopicFamily,
      continuation.after,
    )
    await applyLivePostTopicPage(data, page.topicIds)
    const next = nextContinuation(continuation, page.cursor)
    if (next) await enqueuePostPublicationEffects(continuationJob(data, next))
    return
  }
  const page =
    continuation.kind === 'post_slugs'
      ? await listLivePostSlugsPage(subjectId, continuation.after)
      : await listLiveTopicAliasesPage(subjectId, continuation.after)
  const names = 'slugs' in page ? page.slugs : page.aliases
  await invalidateExactPublicationCacheKeys({
    postIds: [],
    postSlugs: continuation.kind === 'post_slugs' ? names : [],
    userKeys: [],
    communityKeys: [],
    rssFeedIds: [],
    rssFeedItemIds: [],
    topicKeys: continuation.kind === 'topic_aliases' ? [subjectId, ...names] : [],
  })
  const next = nextContinuation(continuation, page.cursor)
  if (next) await enqueuePostPublicationEffects(continuationJob(data, next))
}

async function applyLivePostTopicPage(
  data: PostPublicationEffectsJobData,
  topicIds: string[],
): Promise<void> {
  const names = await listLivePublicationIdentityNames({
    userIds: [],
    communityIds: [],
    topicIds,
  })
  await Promise.all([
    invalidateExactPublicationCacheKeys({
      postIds: [],
      postSlugs: [],
      userKeys: [],
      communityKeys: [],
      rssFeedIds: [],
      rssFeedItemIds: [],
      topicKeys: [...topicIds, ...names.topicSlugs],
    }),
    enqueueBulkUpdateTopicRatingStatsForTopicId(topicIds),
    enqueueLivePublicationIdentityEffects(data, {
      postIds: [],
      topicIds,
      rssFeedIds: [],
      rssFeedItemIds: [],
    }),
  ])
}

/** A topic's complete identity scan is shared by every expanded key chunk in one change. */
function topicIdentityJobs(
  data: PostPublicationEffectsJobData,
  ids: readonly string[],
  kinds: Continuation['kind'][] = ['topic_aliases', 'topic_merged_sources'],
) {
  const canonical = {
    ...data,
    postId: null,
    keys: [],
    keyHash: hashCapturedPublicationKeys([]),
    chunkIndex: 0,
  }
  return [...new Set(ids)]
    .toSorted()
    .flatMap(id =>
      kinds.map(kind =>
        continuationJob(canonical, { kind, subjectIds: [id], subjectIndex: 0, after: null }),
      ),
    )
}
