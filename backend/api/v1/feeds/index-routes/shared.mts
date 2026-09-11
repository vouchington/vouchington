import { createPaginationParser } from '@modules/pagination'
import { loadCommunityForViewer } from '@services/communities'
import { type PostFeedType, type RssFeedItemFeedType } from '@services/feeds/types'
import { resolveHashtagTopicSearch } from '@services/search-params'
import { requireAuth } from '../../../response-helpers.mts'

export const postFeedParser = createPaginationParser({
  cursor: { type: ['timestamp', 'score'] as const },
  limit: { min: 1, max: 100, default: 25 },
  filters: {
    postTypes: true,
    timeRange: true,
    sort: ['new', 'hot'] as const,
    search: true,
  },
})

export const rssFeedItemFeedParser = createPaginationParser({
  cursor: { type: 'timestamp' as const },
  limit: { min: 1, max: 100, default: 25 },
  filters: {
    timeRange: true,
    search: true,
    mediaTypes: true,
  },
})

export async function parseHashtagFeedSearchOptions(query: Record<string, unknown>) {
  const hashtagSearch = await resolveHashtagTopicSearch(query.q)
  return {
    has_unknown_hashtag: hashtagSearch.hasUnknown,
    ...(query.q && hashtagSearch.textSearchQuery
      ? { text_search_query: hashtagSearch.textSearchQuery }
      : {}),
    ...(hashtagSearch.topicIds.length > 0 && { hashtag_topic_ids: hashtagSearch.topicIds }),
    ...(hashtagSearch.filters.some(filter => filter.kind === 'exact_alias') && {
      hashtag_alias_ids: hashtagSearch.filters.flatMap(filter =>
        filter.kind === 'exact_alias' ? [filter.aliasId] : [],
      ),
    }),
  }
}

export async function loadOptionalFeedCommunityScope(
  currentUser: Awaited<ReturnType<typeof requireAuth>>,
  feedType: PostFeedType | RssFeedItemFeedType,
  communityParam: string | undefined,
) {
  if (!communityParam || feedType === 'follow_users') return undefined

  try {
    return await loadCommunityForViewer(currentUser, communityParam)
  } catch (error) {
    const status =
      (error as { status?: number; statusCode?: number }).status ??
      (error as { status?: number; statusCode?: number }).statusCode
    if (status === 403 || status === 404) return undefined
    throw error
  }
}
