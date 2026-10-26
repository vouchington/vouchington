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
import {
  LIVE_POST_TOPIC_FAMILIES,
  listLivePostTopicPage,
  type LivePostTopicFamily,
} from '@services/post-publication/live-post-topic-pages'
import { getPostPublicationWorkLimit } from '@services/post-publication/work-limits'
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
    ...subjectChainJobs(data, 'topic_aliases', subjects.topicIds),
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

export async function enqueueSubjectChains(
  data: PostPublicationEffectsJobData,
  kind: Continuation['kind'],
  ids: readonly string[],
): Promise<void> {
  await enqueueBulkPostPublicationEffects(subjectChainJobs(data, kind, ids))
}

function subjectChainJobs(
  data: PostPublicationEffectsJobData,
  kind: Continuation['kind'],
  ids: readonly string[],
): PostPublicationEffectsJobData[] {
  const subjects = [...new Set(ids)].toSorted()
  const limit = getPostPublicationWorkLimit('capture_batch_size')
  const jobs: PostPublicationEffectsJobData[] = []
  for (let offset = 0; offset < subjects.length; offset += limit) {
    jobs.push(
      continuationJob(data, {
        kind,
        subjectIds: subjects.slice(offset, offset + limit),
        subjectIndex: 0,
        after: null,
      }),
    )
  }
  return jobs
}

/** One live slug/alias page; the next job carries only its bounded UUID list and cursor. */
export async function processLivePublicationIdentityContinuation(
  data: PostPublicationEffectsJobData,
): Promise<void> {
  const continuation = data.continuation
  if (!continuation) throw new TypeError('Publication continuation payload is required')
  const subjectId = continuation.subjectIds[continuation.subjectIndex]
  if (!subjectId) throw new TypeError('Publication continuation has no current subject')
  if (LIVE_POST_TOPIC_FAMILIES.includes(continuation.kind as LivePostTopicFamily)) {
    const page = await listLivePostTopicPage(
      subjectId,
      continuation.kind as LivePostTopicFamily,
      continuation.after,
    )
    await applyLivePostTopicPage(page.topicIds)
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

async function applyLivePostTopicPage(topicIds: string[]): Promise<void> {
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
  ])
}

export function continuationJob(
  data: PostPublicationEffectsJobData,
  continuation: Continuation,
): PostPublicationEffectsJobData {
  return { ...data, keys: [], continuation }
}

export function nextContinuation(
  current: Continuation,
  cursor: string | null,
): Continuation | null {
  if (cursor) return { ...current, after: cursor }
  const subjectIndex = current.subjectIndex + 1
  return subjectIndex < current.subjectIds.length ? { ...current, subjectIndex, after: null } : null
}
