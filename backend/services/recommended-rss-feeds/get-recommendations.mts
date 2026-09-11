import { read } from '@data-stores/psql'
import { buildPageInfo, decodeUuidCursor, isScoreCursor } from '@modules/pagination'
import { clampLimit } from '@modules/search-utils'
import type { GetRecommendedRssFeedsOptions, GetRecommendedRssFeedsResult } from './types.mts'

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
    -- Topics the current user follows
    user_followed_topics AS (
      SELECT object_id AS topic_id
      FROM relation__user__follow__topic
      WHERE subject_id = $1
        AND deleted_at IS NULL
    ),
    -- Friends' feeds (weight 3.0)
    friends_feeds AS (
      SELECT
        ufr.object_id AS feed_id,
        3.0 AS score,
        'friends'::TEXT AS reason
      FROM relation__user__follow__user ufu
      JOIN relation__user__follow__rss_feed ufr
        ON ufr.subject_id = ufu.object_id
        AND ufr.deleted_at IS NULL
      JOIN rss_feeds rf
        ON rf.id = ufr.object_id
        AND rf.deleted_at IS NULL
      JOIN view_rss_feed_current_states current_state
        ON current_state.rss_feed_id = rf.id
        AND current_state.is_enabled = TRUE
        AND current_state.is_discoverable = TRUE
      WHERE ufu.subject_id = $1
        AND ufu.deleted_at IS NULL
        AND ufr.object_id NOT IN (SELECT feed_id FROM user_followed_feeds)
        AND ufr.object_id NOT IN (SELECT feed_id FROM user_muted_feeds)
    ),
    -- Topic-based feeds (weight 2.5)
    topic_feeds AS (
      SELECT
        rf.id AS feed_id,
        2.5 AS score,
        'topic'::TEXT AS reason
      FROM user_followed_topics uft
      JOIN rss_feeds rf
        ON rf.topic_id = uft.topic_id
        AND rf.deleted_at IS NULL
      JOIN view_rss_feed_current_states current_state
        ON current_state.rss_feed_id = rf.id
        AND current_state.is_enabled = TRUE
        AND current_state.is_discoverable = TRUE
      WHERE rf.id NOT IN (SELECT feed_id FROM user_followed_feeds)
        AND rf.id NOT IN (SELECT feed_id FROM user_muted_feeds)
    ),
    -- Collaborative feeds (weight 2.0): feeds followed by users who share feed overlap
    collaborative_feeds AS (
      SELECT
        ufr2.object_id AS feed_id,
        2.0 AS score,
        'collaborative'::TEXT AS reason
      FROM relation__user__follow__rss_feed ufr1
      JOIN relation__user__follow__rss_feed ufr2
        ON ufr2.subject_id = ufr1.subject_id
        AND ufr2.object_id != ufr1.object_id
        AND ufr2.deleted_at IS NULL
      JOIN rss_feeds rf
        ON rf.id = ufr2.object_id
        AND rf.deleted_at IS NULL
      JOIN view_rss_feed_current_states current_state
        ON current_state.rss_feed_id = rf.id
        AND current_state.is_enabled = TRUE
        AND current_state.is_discoverable = TRUE
      WHERE ufr1.subject_id != $1
        AND ufr1.object_id IN (SELECT feed_id FROM user_followed_feeds)
        AND ufr1.deleted_at IS NULL
        AND ufr2.object_id NOT IN (SELECT feed_id FROM user_followed_feeds)
        AND ufr2.object_id NOT IN (SELECT feed_id FROM user_muted_feeds)
    ),
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
