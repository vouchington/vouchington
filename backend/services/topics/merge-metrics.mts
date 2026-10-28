import type { TransactionQuery } from '@data-stores/psql'
import { processTopicMergeReviewMetricsPage } from './merge-metrics-reviews.mts'
import {
  addUserMetrics,
  type MetricUserRow,
  type TopicMergeMetricStats,
} from './merge-metrics-stats.mts'

export type TopicMergeMetricPhase = 0 | 1 | 2 | 3

type MetricPage = {
  phase: TopicMergeMetricPhase
  cursor: string | null
  hasMore: boolean
  partialStats: TopicMergeMetricStats
}

/** One indexed source page, within the operation row's transaction. */
export async function processTopicMergeMetricsPage(
  query: TransactionQuery,
  operationId: string,
  destinationTopicId: string,
  phase: TopicMergeMetricPhase,
  cursor: string | null,
  limit: number,
  partialStats: TopicMergeMetricStats,
): Promise<MetricPage> {
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new RangeError('Topic merge metric page limit must be a positive integer')

  switch (phase) {
    case 0: {
      // The event id, including a null-score retraction, determines each user's current ballot.
      const { rows } = await query<{ id: string }>(
        `/* processTopicMergeMetricsPage votes */
        WITH page AS MATERIALIZED (
          SELECT id, user_id, score, score_is_neutral, score_is_semantic
          FROM topic_votes
          WHERE topic_id = $2::uuid
            AND id > COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
          ORDER BY id
          LIMIT $4::integer
        ), latest AS (
          SELECT DISTINCT ON (user_id)
            id, user_id, score, score_is_neutral, score_is_semantic
          FROM page
          ORDER BY user_id, id DESC
        ), applied AS (
          INSERT INTO topic_merge_metric_users (
            operation_id, user_id, cursor_topic_vote_id, topic_vote_score,
            topic_vote_score_is_neutral, topic_vote_score_is_semantic
          )
          SELECT $1::uuid, user_id, id, score, score_is_neutral, score_is_semantic FROM latest
          WHERE TRUE ORDER BY user_id
          ON CONFLICT (operation_id, user_id) DO UPDATE SET
            cursor_topic_vote_id = EXCLUDED.cursor_topic_vote_id,
            topic_vote_score = EXCLUDED.topic_vote_score,
            topic_vote_score_is_neutral = EXCLUDED.topic_vote_score_is_neutral,
            topic_vote_score_is_semantic = EXCLUDED.topic_vote_score_is_semantic
          WHERE topic_merge_metric_users.cursor_topic_vote_id IS NULL
             OR topic_merge_metric_users.cursor_topic_vote_id < EXCLUDED.cursor_topic_vote_id
          RETURNING 1
        )
        SELECT id FROM page ORDER BY id`,
        [operationId, destinationTopicId, cursor, limit],
      )
      return pageResult(phase, cursor, rows, limit, partialStats, row => row.id)
    }
    case 1: {
      const rows = await processTopicMergeReviewMetricsPage(
        query,
        operationId,
        destinationTopicId,
        cursor,
        limit,
      )
      return pageResult(phase, cursor, rows, limit, partialStats, row => row.post_id)
    }
    case 2: {
      const { rows } = await query<MetricUserRow>(
        `/* processTopicMergeMetricsPage users */
        WITH page AS MATERIALIZED (
          SELECT user_id, topic_vote_score, topic_vote_score_is_neutral,
            topic_vote_score_is_semantic, review_rating
          FROM topic_merge_metric_users
          WHERE operation_id = $1::uuid
            AND user_id > COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
          ORDER BY user_id
          LIMIT $3::integer
        )
        SELECT page.*, users.vote_weight
        FROM page
        LEFT JOIN users ON users.id = page.user_id AND users.deleted_at IS NULL
        ORDER BY page.user_id`,
        [operationId, cursor, limit],
      )
      const nextStats = { ...partialStats }
      for (const row of rows) addUserMetrics(nextStats, row)
      return pageResult(phase, cursor, rows, limit, nextStats, row => row.user_id)
    }
    case 3: {
      // This relation has no id; its (subject_id, object_id) primary key and reverse index
      // provide the subject cursor. Scan tombstones too, so each page reads at most limit rows.
      const { rows } = await query<{ subject_id: string; deleted_at: Date | null }>(
        `/* processTopicMergeMetricsPage bookmarks */
        SELECT subject_id, deleted_at
        FROM relation__user__follow__topic
        WHERE object_id = $1::uuid
          AND subject_id > COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        ORDER BY subject_id
        LIMIT $3::integer`,
        [destinationTopicId, cursor, limit],
      )
      const nextStats = { ...partialStats }
      nextStats.bookmarks__follow_count += rows.filter(row => row.deleted_at === null).length
      return pageResult(phase, cursor, rows, limit, nextStats, row => row.subject_id)
    }
  }
}

function pageResult<Row>(
  phase: TopicMergeMetricPhase,
  cursor: string | null,
  rows: Row[],
  limit: number,
  partialStats: TopicMergeMetricStats,
  getCursor: (row: Row) => string,
): MetricPage {
  return {
    phase,
    cursor: rows.length ? getCursor(rows[rows.length - 1]!) : cursor,
    hasMore: rows.length === limit,
    partialStats,
  }
}
