import { clampLimit } from '@services/pagination'
import { read } from '@data-stores/psql'
import { buildPageInfo, decodeUuidCursor, isScoreCursor } from '@modules/pagination'

import { collaborativeFeedsCtesSql } from './collaborative-feeds-sql.mts'
import { rssFollowSignalEligibilitySql } from './rss-follow-signal-eligibility.mts'
import type { GetRecommendedRssFeedsOptions, GetRecommendedRssFeedsResult } from './types.mts'
import {
  getRecommendedRssFeedsWorkLimit,
  recommendedRssFeedsWorkMaxValues,
} from './work-limits.mts'

const DEFAULT_LIMIT = 20

export async function getRecommendedRssFeeds(
  currentUserId: string,
  options: GetRecommendedRssFeedsOptions,
): Promise<GetRecommendedRssFeedsResult> {
  const { source = 'all', after } = options
  const safeLimit = Math.floor(clampLimit(options.limit, DEFAULT_LIMIT))

  let cursorScore: number | undefined
  let cursorId: string | undefined
  if (after) {
    const cursor = decodeUuidCursor(
      after,
      isScoreCursor,
      'Invalid cursor format: expected score cursor',
    )
    cursorScore = cursor.score
    cursorId = cursor.id
  }

  const includeFriends = source === 'all' || source === 'friends'
  const includeTopic = source === 'all' || source === 'topic'
  const includeCollaborative = source === 'all' || source === 'collaborative'

  const params: unknown[] = [currentUserId]
  const limitIdx = params.push(safeLimit + 1)
  const friendsUserLimitIdx = params.push(
    getRecommendedRssFeedsWorkLimit('friends_followed_user_limit'),
  )
  const friendsUserHardMaxIdx = params.push(
    recommendedRssFeedsWorkMaxValues.friends_followed_user_limit,
  )
  const friendsFeedLimitIdx = params.push(
    getRecommendedRssFeedsWorkLimit('friends_user_feed_limit'),
  )
  const friendsFeedHardMaxIdx = params.push(
    recommendedRssFeedsWorkMaxValues.friends_user_feed_limit,
  )
  const topicLimitIdx = params.push(getRecommendedRssFeedsWorkLimit('topic_followed_topic_limit'))
  const topicHardMaxIdx = params.push(recommendedRssFeedsWorkMaxValues.topic_followed_topic_limit)

  // Build cursor HAVING condition using parameterized values
  let havingCursor = ''
  if (cursorScore !== undefined && cursorId !== undefined) {
    const scoreIdx = params.push(cursorScore)
    const idIdx = params.push(cursorId)
    havingCursor = `HAVING (SUM(score) < $${scoreIdx} OR (SUM(score) = $${scoreIdx} AND feed_id < $${idIdx}::uuid))`
  }

  const { rows } = await read(
    `/* getRecommendedRssFeeds */
    WITH
    viewer AS (
      SELECT EXISTS (
        SELECT 1
        FROM user_roles viewer_role
        JOIN user_role_types viewer_role_type
          ON viewer_role_type.id = viewer_role.role_type_id
        WHERE viewer_role.user_id = $1
          AND viewer_role_type.slug = 'administrator'
      ) AS is_administrator
    ),
    -- Feeds the current user already follows (to exclude)
    user_followed_feeds AS (
      SELECT object_id AS feed_id
      FROM relation__user__follow__rss_feed
      WHERE subject_id = $1
        AND deleted_at IS NULL
    ),
    -- Feeds the current user has muted (to exclude)
    user_muted_feeds AS (
      SELECT object_id AS feed_id
      FROM relation__user__mute__rss_feed
      WHERE subject_id = $1
        AND deleted_at IS NULL
    ),
    -- Newest topics the current user follows (idx_relation__user__follow__topic__subject__newest)
    user_followed_topics AS (
      SELECT object_id AS topic_id
      FROM relation__user__follow__topic
      WHERE subject_id = $1
        AND deleted_at IS NULL
      ORDER BY created_at DESC, object_id DESC
      LIMIT LEAST($${topicLimitIdx}::bigint, $${topicHardMaxIdx}::bigint)
    ),
    -- Newest eligible accounts the current user follows (idx_relation__user__follow__user__subject__newest)
    friends_seed_users AS MATERIALIZED (
      SELECT friend.user_id
      FROM (
        SELECT object_id AS user_id
        FROM relation__user__follow__user
        WHERE subject_id = $1
          AND deleted_at IS NULL
        ORDER BY created_at DESC, object_id DESC
        LIMIT LEAST($${friendsUserLimitIdx}::bigint, $${friendsUserHardMaxIdx}::bigint)
      ) friend
      JOIN users source_user ON source_user.id = friend.user_id
      CROSS JOIN viewer
      WHERE ${rssFollowSignalEligibilitySql}
    ),
    -- Friends' newest feeds (weight 3.0; bounded by friends_followed_user_limit x friends_user_feed_limit)
    friends_feeds AS (
      SELECT
        ufr.object_id AS feed_id,
        3.0 AS score,
        'friends'::TEXT AS reason
      FROM friends_seed_users friend
      CROSS JOIN LATERAL (
        SELECT ufr.object_id
        FROM relation__user__follow__rss_feed ufr
        WHERE ufr.subject_id = friend.user_id
          AND ufr.deleted_at IS NULL
        ORDER BY ufr.created_at DESC, ufr.object_id DESC
        LIMIT LEAST($${friendsFeedLimitIdx}::bigint, $${friendsFeedHardMaxIdx}::bigint)
      ) ufr
      JOIN rss_feeds rf
        ON rf.id = ufr.object_id
        AND rf.deleted_at IS NULL
        AND rf.is_enabled = TRUE
        AND rf.is_discoverable = TRUE
      WHERE NOT EXISTS (SELECT 1 FROM user_followed_feeds WHERE user_followed_feeds.feed_id = ufr.object_id)
        AND NOT EXISTS (SELECT 1 FROM user_muted_feeds WHERE user_muted_feeds.feed_id = ufr.object_id)
    ),
    -- Topic-based feeds (weight 2.5; idx_rss_feeds__topic_id__unique maps each topic to at most one live feed)
    topic_feeds AS (
      SELECT
        rf.id AS feed_id,
        2.5 AS score,
        'topic'::TEXT AS reason
      FROM user_followed_topics uft
      CROSS JOIN LATERAL (
        SELECT rf.id
        FROM rss_feeds rf
        WHERE rf.topic_id = uft.topic_id
          AND rf.deleted_at IS NULL
          AND rf.is_enabled = TRUE
          AND rf.is_discoverable = TRUE
        LIMIT 1
      ) rf
      WHERE NOT EXISTS (SELECT 1 FROM user_followed_feeds WHERE user_followed_feeds.feed_id = rf.id)
        AND NOT EXISTS (SELECT 1 FROM user_muted_feeds WHERE user_muted_feeds.feed_id = rf.id)
    ),
    ${collaborativeFeedsCtesSql()}
    -- Union of selected sources
    all_candidates AS (
      ${includeFriends ? 'SELECT feed_id, score, reason FROM friends_feeds' : ''}
      ${includeFriends && (includeTopic || includeCollaborative) ? 'UNION ALL' : ''}
      ${includeTopic ? 'SELECT feed_id, score, reason FROM topic_feeds' : ''}
      ${includeTopic && includeCollaborative ? 'UNION ALL' : ''}
      ${includeCollaborative ? 'SELECT feed_id, score, reason FROM collaborative_feeds' : ''}
      ${!includeFriends && !includeTopic && !includeCollaborative ? 'SELECT NULL::UUID AS feed_id, 0::DOUBLE PRECISION AS score, NULL::TEXT AS reason WHERE FALSE' : ''}
    ),
    -- Aggregate scores and reasons
    aggregated AS (
      SELECT
        feed_id AS rss_feed_id,
        SUM(score)::DOUBLE PRECISION AS total_score,
        array_agg(DISTINCT reason) AS recommendation_reasons
      FROM all_candidates
      GROUP BY feed_id
      ${havingCursor}
    )
    SELECT rss_feed_id AS id, total_score AS recommendation_score, recommendation_reasons
    FROM aggregated
    ORDER BY total_score DESC, rss_feed_id DESC
    LIMIT $${limitIdx}`,
    params,
  )

  const hasNextPage = rows.length > safeLimit
  const results = rows.slice(0, safeLimit).map(row => ({
    id: row.id as string,
    recommendation_score: row.recommendation_score as number,
    recommendation_reasons: row.recommendation_reasons as string[],
  })) as GetRecommendedRssFeedsResult['results']

  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage,
      getCursor: item => ({ score: item.recommendation_score, id: item.id }),
    }),
  }
}
