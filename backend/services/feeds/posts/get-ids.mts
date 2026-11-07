import { clampLimit } from '@services/pagination'
import type { PrivateUser } from '@services/users/types'
import type { PostFeedOptions, PostFeedResponse } from '../types.mts'
import { read } from '@data-stores/psql'
import { getTimeRangeLowerBoundDate } from '../time-range-utils.mts'
import type { PostFeedWalkSort } from './get-ids/eligible-posts-cte.mts'
import { mapPostFeedResponse, parsePostFeedCursor } from './get-ids/feed-cursor.mts'
import { buildPostFeedPageQuery } from './get-ids/page-query.mts'

const DEFAULT_MIN_SCORE_FOLLOW_USERS = -5
const DEFAULT_MIN_SCORE_FOLLOW_TOPICS = 0
const HOT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

export async function getPostFeedIds(
  currentUser: PrivateUser,
  options: PostFeedOptions = {},
  asOf: Date = new Date(),
): Promise<PostFeedResponse> {
  const requestedInstant = new Date(asOf)
  if (!Number.isFinite(requestedInstant.getTime()))
    throw new RangeError('Invalid feed decision instant')
  const { feed_type = 'any', post_types, limit, time_range = '1w' } = options
  // Hot decays with age, so it ranks only a bounded recent window; longer windows rank by score.
  const sort: PostFeedWalkSort =
    options.sort === 'hot' ? (time_range === '1y' || time_range === 'all' ? 'best' : 'hot') : 'new'
  const cursor = parsePostFeedCursor(options.after, sort)
  // Hot scores keep one decision instant across pages, carried in the cursor.
  const decisionInstant = cursor?.sort === 'hot' ? new Date(cursor.asOf) : requestedInstant
  const requestedCutoff = getTimeRangeLowerBoundDate(time_range, decisionInstant)
  const hotFloor = new Date(decisionInstant.getTime() - HOT_WINDOW_MS)
  const cutoff =
    sort === 'hot' && (!requestedCutoff || requestedCutoff < hotFloor) ? hotFloor : requestedCutoff
  const safeLimit = clampLimit(limit)

  const query = buildPostFeedPageQuery({
    communityId: options.community_id,
    currentUserId: currentUser.id,
    cursor,
    cutoff,
    eligibilityOptions: {
      currentUser,
      postTypes: post_types,
      sort,
      scoreReferenceDate: sort === 'hot' ? decisionInstant : undefined,
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
  })
  const { rows } = await read(query)
  return mapPostFeedResponse(rows, safeLimit, sort, decisionInstant)
}
