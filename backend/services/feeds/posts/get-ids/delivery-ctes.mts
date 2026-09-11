import sql, { type SQLStatement } from 'sql-template-strings'
import { buildFeedTypeCondition } from '../../sql-builders/index.mts'
import { buildTimeRangeFilter } from '../../time-range-utils.mts'
import type { PostFeedOptions } from '../../types.mts'
import type { PostFeedCursor } from './feed-cursor.mts'
import { appendSharedPosts } from './shared-posts-cte.mts'
import { buildDirectTopicsFilter } from './topic-match-filter.mts'
import { buildBroadcastVisibilityFilter } from './visibility-filter.mts'
export function appendPostFeedDeliveryCTEs(
  query: SQLStatement,
  {
    currentUserId,
    cursor,
    feedType,
    includeSharedPosts,
    minScoreFollowTopics,
    minScoreFollowUsers,
    sort,
    timeRange,
  }: {
    currentUserId: string
    cursor: PostFeedCursor
    feedType: PostFeedOptions['feed_type']
    includeSharedPosts: boolean
    minScoreFollowTopics: number
    minScoreFollowUsers: number
    sort: string
    timeRange: PostFeedOptions['time_range']
  },
): void {
  appendDirectCandidatePosts(query, { minScoreFollowTopics, minScoreFollowUsers, sort, timeRange })
  appendDirectPosts(query, {
    currentUserId,
    feedType,
    minScoreFollowTopics,
    minScoreFollowUsers,
    sort,
  })
  appendSharedPosts(query, { currentUserId, cursor, includeSharedPosts, sort, timeRange })
  query.append(sql`
    ),
    combined_posts AS (
      SELECT * FROM direct_posts
      UNION ALL
      SELECT * FROM shared_posts
    )`)
}

function appendDirectCandidatePosts(
  query: SQLStatement,
  {
    minScoreFollowTopics,
    minScoreFollowUsers,
    sort,
    timeRange,
  }: {
    minScoreFollowTopics: number
    minScoreFollowUsers: number
    sort: string
    timeRange: PostFeedOptions['time_range']
  },
): void {
  const directTopicsFilter = buildDirectTopicsFilter()
  query.append(sql`,
    direct_candidate_posts AS (
      SELECT
        eligible_posts.id AS result_id,
        eligible_posts.id AS entity_id,
        eligible_posts.post_type,
        eligible_posts.created_at AS sort_at,
        eligible_posts.votes_score_net,
        eligible_posts.created_by_id,
        eligible_posts.broadcast,
        'direct'::text AS delivery_type,
        NULL::uuid AS shared_by_user_id,
        NULL::timestamptz AS shared_at,`)
  if (sort === 'hot') query.append(sql`\n        eligible_posts.hot_score,`)
  query
    .append(sql`
        (
          eligible_posts.votes_score_net >= ${minScoreFollowUsers}
          AND EXISTS (
            SELECT 1 FROM followed_users
            WHERE followed_users.user_id = eligible_posts.created_by_id
          )
        ) AS matches_source,
        (
          eligible_posts.votes_score_net >= ${minScoreFollowTopics}
          AND (`)
    .append(directTopicsFilter).append(sql`)
        ) AS matches_topics
      FROM eligible_posts
      WHERE 1 = 1
    `)
  const timeRangeFilter = buildTimeRangeFilter(timeRange ?? '1w', 'eligible_posts.id')
  if (timeRangeFilter) query.append(sql`\n        AND `).append(timeRangeFilter)
}

function appendDirectPosts(
  query: SQLStatement,
  {
    currentUserId,
    feedType,
    minScoreFollowTopics,
    minScoreFollowUsers,
    sort,
  }: {
    currentUserId: string
    feedType: PostFeedOptions['feed_type']
    minScoreFollowTopics: number
    minScoreFollowUsers: number
    sort: string
  },
): void {
  query.append(sql`
    ),
    direct_posts AS (
      SELECT
        direct_candidate_posts.result_id,
        direct_candidate_posts.entity_id,
        direct_candidate_posts.post_type,
        direct_candidate_posts.sort_at,
        direct_candidate_posts.delivery_type,
        direct_candidate_posts.shared_by_user_id,
        direct_candidate_posts.shared_at`)
  if (sort === 'hot') query.append(sql`,\n        direct_candidate_posts.hot_score`)
  query.append(sql`
      FROM direct_candidate_posts
      WHERE 1 = 1
    `)
  query.append(
    buildDirectFeedTypeCondition({ feedType, minScoreFollowTopics, minScoreFollowUsers }),
  )
  query
    .append(sql`\n        AND `)
    .append(buildBroadcastVisibilityFilter('direct_candidate_posts', currentUserId))
}

function buildDirectFeedTypeCondition({
  feedType,
  minScoreFollowTopics,
  minScoreFollowUsers,
}: {
  feedType: PostFeedOptions['feed_type']
  minScoreFollowTopics: number
  minScoreFollowUsers: number
}): SQLStatement {
  return buildFeedTypeCondition(feedType ?? 'all', {
    sourceType: 'users',
    sourceIdColumn: 'direct_candidate_posts.created_by_id',
    scoreColumn: 'direct_candidate_posts.votes_score_net',
    followedCTEAlias: 'followed_users',
    followedCTEColumn: 'user_id',
    topicsConditions: [],
    minScoreSource: minScoreFollowUsers,
    minScoreTopics: minScoreFollowTopics,
    sourceMatchColumn: 'direct_candidate_posts.matches_source',
    topicsMatchColumn: 'direct_candidate_posts.matches_topics',
  })
}
