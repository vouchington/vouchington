import type { PrivateUser } from '@services/users/types'
import type { PostFeedOptions, PostFeedResponse } from '../types.mts'
import sql from 'sql-template-strings'
import { read } from '@data-stores/psql'
import { clampLimit } from '@modules/search-utils'
import { appendPostFeedDeliveryCTEs } from './get-ids/delivery-ctes.mts'
import { appendEligiblePostsCTE } from './get-ids/eligible-posts-cte.mts'
import { mapPostFeedResponse, parsePostFeedCursor } from './get-ids/feed-cursor.mts'
import { appendPostFeedFinalSelect } from './get-ids/final-select.mts'
import { appendPostFeedRelationCTEs } from './get-ids/relation-ctes.mts'

const DEFAULT_MIN_SCORE_FOLLOW_USERS = -5
const DEFAULT_MIN_SCORE_FOLLOW_TOPICS = 0

export async function getPostFeedIds(
  currentUser: PrivateUser,
  options: PostFeedOptions = {},
): Promise<PostFeedResponse> {
  const { feed_type = 'any', post_types, sort = 'new', limit, time_range = '1w' } = options
  const safeLimit = clampLimit(limit)
  const cursor = parsePostFeedCursor(options.after, sort)
  const query = sql`/* getPostFeedIds */
    WITH `

  appendPostFeedRelationCTEs(query, {
    communityId: options.community_id,
    currentUserId: currentUser.id,
  })
  appendEligiblePostsCTE(query, {
    currentUser,
    postTypes: post_types,
    sort,
    textSearchQuery: options.text_search_query,
    universalTopicIds: options.universal_topic_ids,
    hashtagTopicIds: options.hashtag_topic_ids,
    hashtagAliasIds: options.hashtag_alias_ids,
    hasUnknownHashtag: options.has_unknown_hashtag,
  })
  appendPostFeedDeliveryCTEs(query, {
    currentUserId: currentUser.id,
    cursor,
    feedType: feed_type,
    includeSharedPosts: feed_type === 'follow_users' || feed_type === 'any',
    minScoreFollowTopics: options.min_score_follow_topics ?? DEFAULT_MIN_SCORE_FOLLOW_TOPICS,
    minScoreFollowUsers: options.min_score_follow_users ?? DEFAULT_MIN_SCORE_FOLLOW_USERS,
    sort,
    timeRange: time_range,
  })
  appendPostFeedFinalSelect(query, {
    cursor,
    safeLimit,
    sort,
  })

  const { rows } = await read(query)
  return mapPostFeedResponse(rows, safeLimit, sort)
}
