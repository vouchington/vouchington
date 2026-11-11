import { clampLimit } from '@services/pagination'
import type { PrivateUser } from '@services/users/types'
import type { PostFeedOptions, PostFeedResponse } from '../types.mts'
import { read } from '@data-stores/psql'
import { getTimeRangeLowerBoundDate } from '../time-range-utils.mts'
import type { PostFeedWalkSort } from './get-ids/eligible-posts-cte.mts'
import { mapPostFeedResponse, parsePostFeedCursor } from './get-ids/feed-cursor.mts'
import { buildRankedPostFeedPageQuery } from './get-ids/ranked-walk-query.mts'
import { buildTopicPostFeedPageQuery } from './get-ids/topic-walk-query.mts'
import { TOPIC_WALK_ROW_CAP } from '@services/posts/search/query-builder/topic-walk'
import { hasTopicMembershipFilters } from '@services/posts/search/query-builder/topic-filters'
import { buildPostFeedPageQuery } from './get-ids/page-query.mts'

const DEFAULT_MIN_SCORE_FOLLOW_USERS = -5
const DEFAULT_MIN_SCORE_FOLLOW_TOPICS = 0
const HOT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

export async function getPostFeedIds(
  currentUser: PrivateUser,
  options: PostFeedOptions = {},
  asOf: Date = new Date(),
  inspectedRowCap: number = TOPIC_WALK_ROW_CAP,
): Promise<PostFeedResponse> {
  const requestedInstant = new Date(asOf)
  if (!Number.isFinite(requestedInstant.getTime()))
    throw new RangeError('Invalid feed decision instant')
  const { feed_type = 'any', post_types, limit, time_range = '1w' } = options
  // Hot decays with age, so it ranks only a bounded recent window; longer windows rank by score.
  const sort: PostFeedWalkSort =
    options.sort === 'hot' ? (time_range === '1y' || time_range === 'all' ? 'best' : 'hot') : 'new'
  const cursor = parsePostFeedCursor(options.after, sort)
  if (options.has_unknown_hashtag)
    return {
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    }
  // The hot rank is immutable; keep one time-window decision instant across pages.
  const decisionInstant =
    cursor?.sort === 'hot' ? new Date(cursor.asOf ?? Number.NaN) : requestedInstant
  const requestedCutoff = getTimeRangeLowerBoundDate(time_range, decisionInstant)
  const hotFloor = new Date(decisionInstant.getTime() - HOT_WINDOW_MS)
  const cutoff =
    sort === 'hot' && (!requestedCutoff || requestedCutoff < hotFloor) ? hotFloor : requestedCutoff
  const safeLimit = clampLimit(limit)

  const pageOptions = {
    communityId: options.community_id,
    currentUserId: currentUser.id,
    cursor,
    cutoff,
    eligibilityOptions: {
      currentUser,
      postTypes: post_types,
      sort,
      textSearchQuery: options.text_search_query,
      universalTopicIds: options.universal_topic_ids,
      hashtagTopicIds: options.hashtag_topic_ids,
      hashtagAliasIds: options.hashtag_alias_ids,
      hasUnknownHashtag: options.has_unknown_hashtag,
    },
    feedType: feed_type,
    includeSharedPosts: feed_type === 'follow_users' || feed_type === 'any',
    minScoreFollowTopics: options.min_score_follow_topics ?? DEFAULT_MIN_SCORE_FOLLOW_TOPICS,
    minScoreFollowUsers: options.min_score_follow_users ?? DEFAULT_MIN_SCORE_FOLLOW_USERS,
    safeLimit,
  }
  const topicFiltered = hasTopicMembershipFilters(options)
  const query =
    sort === 'hot' || (sort === 'best' && topicFiltered)
      ? buildRankedPostFeedPageQuery(pageOptions, inspectedRowCap)
      : topicFiltered
        ? buildTopicPostFeedPageQuery(pageOptions, inspectedRowCap)
        : buildPostFeedPageQuery(pageOptions)
  const { rows } = await read(query)
  return mapPostFeedResponse(rows, safeLimit, sort, decisionInstant, inspectedRowCap)
}
