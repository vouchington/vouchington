import { indexById } from '@modules/utils'
import { getPostByAnyCachedBatch, getRssFeedItemByIdCachedBatch } from '@services/entity-fetch'
import { getPostIdsCached, searchRssFeedItemsCached } from '@services/entity-fetch/search-caches'
import { getPostIds } from '@services/posts/search/get-ids'
import { getPublicPostIds } from '@services/posts'
import { searchRssFeedItems } from '@services/rss-feed-items/search'
import type { OmnisearchNewsItem, OmnisearchOptions, OmnisearchPost } from './omnisearch.mts'

const DEFAULT_LIMIT = 3

export async function searchPostsVertical(options: OmnisearchOptions): Promise<OmnisearchPost[]> {
  const {
    currentUser,
    textSearchQuery,
    hashtagTopicIds,
    hashtagAliasIds,
    hasUnknownHashtag,
    limit = DEFAULT_LIMIT,
  } = options
  if (hasUnknownHashtag) return []
  const params = {
    text_search_query: textSearchQuery,
    hashtag_topic_ids: hashtagTopicIds?.length ? hashtagTopicIds : undefined,
    hashtag_alias_ids: hashtagAliasIds?.length ? hashtagAliasIds : undefined,
    limit,
  }
  const { results } = currentUser
    ? await getPostIds(currentUser, params)
    : await getPostIdsCached(params)
  if (results.length === 0) return []
  const visibleResults = currentUser
    ? results
    : await getPublicPostIds(results.map(result => result.id)).then(publicPostIds =>
        results.filter(result => publicPostIds.has(result.id)),
      )
  const postsById = indexById(
    await getPostByAnyCachedBatch(visibleResults.map(result => result.id)),
  )
  return visibleResults.flatMap(result => {
    const post = postsById[result.id]
    if (!post) return []
    const authoredTitle = post.title.trim() || null
    return [
      {
        id: result.id,
        post_type: result.post_type,
        title: authoredTitle ?? 'Untitled Post',
        authored_title: authoredTitle,
        declared_language: post.declared_language ?? null,
        lingua_rs_detected_language: post.lingua_rs_detected_language ?? null,
      },
    ]
  })
}

export async function searchNewsVertical(
  options: OmnisearchOptions,
): Promise<OmnisearchNewsItem[]> {
  const {
    currentUser,
    textSearchQuery,
    hashtagTopicIds,
    hashtagAliasIds,
    hasUnknownHashtag,
    limit = DEFAULT_LIMIT,
  } = options
  if (hasUnknownHashtag) return []
  const params = {
    text_search_query: textSearchQuery,
    hashtag_topic_ids: hashtagTopicIds?.length ? hashtagTopicIds : undefined,
    hashtag_alias_ids: hashtagAliasIds?.length ? hashtagAliasIds : undefined,
    limit,
  }
  const { results } = currentUser
    ? await searchRssFeedItems(params)
    : await searchRssFeedItemsCached(params)
  if (results.length === 0) return []
  const itemsById = indexById(await getRssFeedItemByIdCachedBatch(results.map(result => result.id)))
  return results.flatMap(result => {
    const item = itemsById[result.id]
    if (!item) return []
    return [
      {
        id: result.id,
        url: item.url.url,
        title: item.data.title ?? '',
        feed_title: item.rss_feed.title ?? '',
      },
    ]
  })
}
