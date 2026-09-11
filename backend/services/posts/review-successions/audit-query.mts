import { read } from '@data-stores/psql'
import {
  buildOtherwisePublicPostEligibilityFilter,
  buildPublicPostEligibilityFilter,
} from '@modules/feed-query-builders'
import sql from 'sql-template-strings'

export const REVIEW_SUCCESSION_HISTORY_AUDIT_PAGE_SIZE = 100
const REVIEW_SUCCESSION_HISTORY_AUDIT_QUERY_LIMIT = REVIEW_SUCCESSION_HISTORY_AUDIT_PAGE_SIZE + 1

export type ReviewSuccessionHistoryAuditRow = {
  id: string
  archived_at: Date | null
  author_user_id: string | null
  topic_ids: string[] | null
  matching_manual_override_at: Date | null
  matching_automatically_restored_at: Date | null
  active_predecessor_archived_at: Date | null
  newer_exact_current_set_reviews: Array<{
    id: string
    archivedAt: string | null
    isPublic: boolean
    isOtherwisePublic: boolean
  }>
}

export async function listReviewSuccessionHistoryAuditRows(
  cursor: string | null,
  cutoffArchivedAt: string,
): Promise<ReviewSuccessionHistoryAuditRow[]> {
  const statement = sql`/* listReviewSuccessionHistoryAuditRows */
    WITH archived_page AS MATERIALIZED (
      SELECT review.id
      FROM posts review
      WHERE (${cursor}::uuid IS NULL OR review.id > ${cursor}::uuid)
        AND review.post_type = 'review'
        AND review.root_id IS NULL
        AND review.archived_at IS NOT NULL
        AND review.archived_at <= ${cutoffArchivedAt}::timestamptz
        AND EXISTS (
          SELECT 1 FROM post_review_topic_ratings rating WHERE rating.post_id = review.id
        )
      ORDER BY review.id
      LIMIT ${REVIEW_SUCCESSION_HISTORY_AUDIT_QUERY_LIMIT}
    ), active_page AS MATERIALIZED (
      SELECT succession.predecessor_post_id
      FROM review_successions succession
      WHERE (${cursor}::uuid IS NULL OR succession.predecessor_post_id > ${cursor}::uuid)
        AND succession.predecessor_archived_at <= ${cutoffArchivedAt}::timestamptz
        AND succession.automatically_restored_at IS NULL
        AND succession.manual_override_at IS NULL
      ORDER BY succession.predecessor_post_id
      LIMIT ${REVIEW_SUCCESSION_HISTORY_AUDIT_QUERY_LIMIT}
    ), source_page AS MATERIALIZED (
      SELECT id FROM archived_page
      UNION
      SELECT predecessor_post_id FROM active_page
      ORDER BY id
      LIMIT ${REVIEW_SUCCESSION_HISTORY_AUDIT_QUERY_LIMIT}
    ), current_topics AS MATERIALIZED (
      SELECT review.id, review.created_by_id AS author_user_id,
        ARRAY_AGG(rating.topic_id ORDER BY rating.topic_id) AS topic_ids
      FROM source_page page
      JOIN posts review ON review.id = page.id
      JOIN post_review_topic_ratings rating ON rating.post_id = review.id
      GROUP BY review.id, review.created_by_id
    )
    SELECT candidate.id, candidate.archived_at, topics.author_user_id, topics.topic_ids,
      matching.manual_override_at AS matching_manual_override_at,
      matching.automatically_restored_at AS matching_automatically_restored_at,
      active.predecessor_archived_at AS active_predecessor_archived_at,
      COALESCE(newer.reviews, '[]'::jsonb) AS newer_exact_current_set_reviews
    FROM source_page page
    JOIN posts candidate ON candidate.id = page.id
    LEFT JOIN current_topics topics ON topics.id = candidate.id
    LEFT JOIN LATERAL (
      SELECT succession.manual_override_at, succession.automatically_restored_at
      FROM review_successions succession
      WHERE succession.predecessor_post_id = candidate.id
        AND succession.predecessor_archived_at = candidate.archived_at
      ORDER BY succession.id
      LIMIT 1
    ) matching ON true
    LEFT JOIN LATERAL (
      SELECT succession.predecessor_archived_at
      FROM review_successions succession
      WHERE succession.predecessor_post_id = candidate.id
        AND succession.automatically_restored_at IS NULL
        AND succession.manual_override_at IS NULL
      ORDER BY succession.id
      LIMIT 1
    ) active ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'id', eligible.id,
        'archivedAt', eligible.archived_at,
        'isPublic', eligible.is_public,
        'isOtherwisePublic', eligible.is_otherwise_public
      ) ORDER BY eligible.id) AS reviews
      FROM (
        SELECT newer.id, newer.archived_at, (`
  statement.append(buildPublicPostEligibilityFilter('newer', 'newer_root'))
  statement.append(sql`) AS is_public, (`)
  statement.append(buildOtherwisePublicPostEligibilityFilter('newer', 'newer_root'))
  statement.append(sql`) AS is_otherwise_public
        FROM posts newer
        JOIN posts newer_root ON newer_root.id = COALESCE(newer.root_id, newer.id)
        WHERE topics.author_user_id IS NOT NULL
          AND newer.id > candidate.id
          AND newer.created_by_id = topics.author_user_id
          AND newer.post_type = 'review'
          AND newer.root_id IS NULL
          AND (
            SELECT ARRAY_AGG(newer_rating.topic_id ORDER BY newer_rating.topic_id)
            FROM post_review_topic_ratings newer_rating
            WHERE newer_rating.post_id = newer.id
          ) = topics.topic_ids
      ) eligible
    ) newer ON true
    ORDER BY candidate.id`)
  const { rows } = await read<ReviewSuccessionHistoryAuditRow>(statement)
  return rows
}
