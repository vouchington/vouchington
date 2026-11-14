import { getPaginationLimits } from '@services/pagination'
import { indexById } from '@modules/utils'
import { getPostByAnyCachedBatch, getRssFeedItemByIdCachedBatch } from '@services/entity-fetch'
import { getAnonymousPostRowsByIdsCached } from '@services/posts/anonymous-snapshot'
import { getPostIdsCached, searchRssFeedItemsCached } from '@services/entity-fetch/search-caches'
import { getPostIds } from '@services/posts/search/get-ids'
import { searchRssFeedItems } from '@services/rss-feed-items/search'
import type { OmnisearchNewsItem, OmnisearchOptions, OmnisearchPost } from './omnisearch-types.mts'

type PostVerticalResult = {
  results: OmnisearchPost[]
  page_info: Awaited<ReturnType<typeof getPostIds>>['page_info']
}

export async function searchPostsVertical(options: OmnisearchOptions): Promise<PostVerticalResult> {
  const {
    currentUser,
    textSearchQuery,
    hashtagTopicIds,
    hashtagAliasIds,
    hasUnknownHashtag,
    postAfter,
    limit = getPaginationLimits(3).default,
  } = options
  if (hasUnknownHashtag) {
    return {
      results: [],
      page_info: { start_cursor: null, end_cursor: null, has_next_page: false },
    }
  }
  const params = {
    text_search_query: textSearchQuery,
    hashtag_topic_ids: hashtagTopicIds?.length ? hashtagTopicIds : undefined,
    hashtag_alias_ids: hashtagAliasIds?.length ? hashtagAliasIds : undefined,
    limit,
    after: postAfter,
  }
  const { results, page_info } = currentUser
    ? await getPostIds(currentUser, params)
    : await getPostIdsCached(params)
  if (results.length === 0) return { results: [], page_info }
  const postsById = indexById(
    currentUser
      ? await getPostByAnyCachedBatch(results.map(result => result.id))
      : (
          await getAnonymousPostRowsByIdsCached(
            results.map(result => result.id),
            'discovery',
          )
        ).map(row => row.post),
  )
  const posts = results.flatMap(result => {
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
  return { results: posts, page_info }
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
    limit = getPaginationLimits(3).default,
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
