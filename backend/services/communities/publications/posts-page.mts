import type { TimeRange } from '@voucha/types/feed'
import type { PageInfo } from '@voucha/types/pagination'
import { DEFAULT_POST_SEARCH_TIME_RANGE } from '@modules/feed-query-builders'
import { resolveHashtagTopicSearch } from '@services/search-params'
import type { BasicUser } from '@services/users/types'
import { searchCommunityPosts } from './approved-posts.mts'
import type { CommunityFeedPost, CommunityPostSort } from './approved-posts-support.mts'
import { getPinnedPostIds } from './pinned.mts'
import {
  shouldExcludeCommunityPinnedPosts,
  shouldIncludeCommunityPinnedPosts,
} from './pinned-post-filter.mts'

export type CommunityPostsPage = {
  results: CommunityFeedPost[]
  page_info: PageInfo
  /** Pinned posts in pin order, present only on the first page of an unfiltered listing. */
  pinned_post_ids: string[]
}

/**
 * One page of a community's approved posts, as `GET /communities/:idOrSlug/posts` serves it.
 *
 * Without `time_range` the page keeps the community default age bound, for every sort.
 * Post search does not apply that bound when its own range is omitted.
 * `q` may carry hashtags, which narrow the page to those topics or aliases. Pinned posts are
 * listed apart from the page: they are left out of every unfiltered page and named in
 * `pinned_post_ids` on its first page only. A filtered or later page names none.
 */
export async function getCommunityPostsPage(
  communityId: string,
  options: {
    currentUser: BasicUser | null
    q?: unknown
    sort?: CommunityPostSort
    /** Community default age bound when omitted; pass `all` for the full history. */
    time_range?: TimeRange
    limit?: number
    after?: string
  },
): Promise<CommunityPostsPage> {
  const { currentUser, sort, limit, after } = options
  const hashtags = await resolveHashtagTopicSearch(options.q)
  const filter = {
    hasHashtagFilter: hashtags.hasUnknown || hashtags.filters.length > 0,
    textSearchQuery: hashtags.textSearchQuery,
    topicIds: hashtags.topicIds,
  }
  const pinnedPostIds = shouldExcludeCommunityPinnedPosts(filter)
    ? await getPinnedPostIds(communityId, currentUser)
    : []

  const result = await searchCommunityPosts(communityId, {
    currentUser,
    limit,
    after,
    sort,
    time_range: options.time_range ?? DEFAULT_POST_SEARCH_TIME_RANGE,
    excludePostIds: pinnedPostIds,
    text_search_query: hashtags.textSearchQuery,
    hashtag_topic_ids: hashtags.topicIds,
    hashtag_alias_ids: hashtags.filters.flatMap(item =>
      item.kind === 'exact_alias' ? [item.aliasId] : [],
    ),
    has_unknown_hashtag: hashtags.hasUnknown,
  })

  const includePinned = shouldIncludeCommunityPinnedPosts({ after, ...filter })
  return { ...result, pinned_post_ids: includePinned ? pinnedPostIds : [] }
}
