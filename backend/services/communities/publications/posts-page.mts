import type { PageInfo } from '@voucha/types/pagination'
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
