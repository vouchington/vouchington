import { enqueuePostPublicationEffects } from '@queues/post-publication/enqueues'
import {
  listLiveFeedCategoriesPage,
  listLiveFeedItemsPage,
  listLiveItemCategoriesPage,
} from '@services/post-publication/live-rss-feed-pages'
import { getPostPublicationWorkLimit } from '@services/post-publication/work-limits'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'
import { enqueueLivePublicationIdentityEffects } from './direct-live-identities.mts'
import { continuationJob, nextContinuation } from './direct-continuations.mts'
type Continuation = NonNullable<PostPublicationEffectsJobData['continuation']>
type ApplyKeys = (
  data: PostPublicationEffectsJobData,
  keys: PostPublicationEffectsJobData['keys'],
  enqueueLivePages: boolean,
) => Promise<{ affectedPosts: number }>

export function isLiveRssContinuation(kind: Continuation['kind']): boolean {
  return (
    kind === 'rss_feed_items' ||
    kind === 'rss_feed_categories' ||
    kind === 'rss_feed_item_categories'
  )
}

/** Re-read one surviving RSS identity page without retaining a PostgreSQL projection cursor. */
export async function processLiveRssContinuation(
  data: PostPublicationEffectsJobData,
  continuation: Continuation,
  applyKeys: ApplyKeys,
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

  const result = await applyExpandedRssKeys(data, keys, applyKeys)
  // A source page can reveal a story post or a shared item's categories only after commit.
  // Their own bounded chains use this capture's stable change identity.
  if (itemIds.length > 0 || postIds.length > 0)
    await enqueueLivePublicationIdentityEffects(data, {
      postIds,
      descendantPostIds: postIds,
      topicIds: [],
      rssFeedIds: [],
      rssFeedItemIds: itemIds,
    })
  const next = nextContinuation(continuation, cursor)
  if (next) await enqueuePostPublicationEffects(continuationJob(data, next))
  return result
}

/** Raw categories can expand into both stored and current alias topics. */
async function applyExpandedRssKeys(
  data: PostPublicationEffectsJobData,
  keys: PostPublicationEffectsJobData['keys'],
  applyKeys: ApplyKeys,
) {
  const limit = getPostPublicationWorkLimit('capture_batch_size')
  const chunks: PostPublicationEffectsJobData['keys'][] = []
  for (let offset = 0; offset < keys.length; offset += limit)
    chunks.push(keys.slice(offset, offset + limit))
  if (chunks.length === 0) chunks.push([])
  // no-mistakes-disable-next-line query-reached-per-item: one capped raw page expands to at most three capture-sized chunks; separate bounded effects calls preserve the identity guard, including the live scope's extra topic.
  await Promise.all(chunks.map(chunk => applyKeys(data, chunk, false)))
  const posts = new Set([
    ...(data.postId ? [data.postId] : []),
    ...keys.flatMap(key => (key.kind === 'impact_post' ? [key.uuidValue] : [])),
  ])
  return { affectedPosts: posts.size }
}
