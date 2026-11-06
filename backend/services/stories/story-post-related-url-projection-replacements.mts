import type { TransactionQuery } from '@data-stores/psql/types'
import { getRelationTypeLimit } from '@services/entity-relations/relation-limits-config'
import { recordPostRelatedUrlPublicationChanges } from '@services/entity-relations/post-topic-publication'
import { markStoryPostRelatedUrlProjectionInvalidationRequired } from './story-post-related-url-projection-invalidation.mts'
import type { ProjectionWork } from './story-post-related-url-projection-types.mts'

/** The caller holds the post/work fences; removals roll back if replacement admission fails. */
export async function pruneObsoleteStoryPostRelatedUrlsForReplacement(
  query: TransactionQuery,
  work: ProjectionWork,
  storyTellerId: string,
): Promise<void> {
  const limit = getRelationTypeLimit('relation__post__related__url')!
  const { rowCount } = await query(
    `/* pruneObsoleteStoryPostRelatedUrlsForReplacement */
      WITH RECURSIVE candidates AS (
        SELECT first_row.*, 1 AS position FROM LATERAL (
          SELECT tableoid AS table_oid, ctid AS row_tid, id, object_id, created_at, created_by_id
          FROM relation__post__related__url
          WHERE subject_id = $1 AND deleted_at IS NULL
          ORDER BY created_at DESC, object_id DESC LIMIT 1 FOR UPDATE
        ) first_row
        UNION ALL
        SELECT next_row.*, previous.position + 1 FROM candidates previous
        CROSS JOIN LATERAL (
          SELECT tableoid AS table_oid, ctid AS row_tid, id, object_id, created_at, created_by_id
          FROM relation__post__related__url
          WHERE subject_id = $1 AND deleted_at IS NULL
            AND (created_at, object_id) < (previous.created_at, previous.object_id)
          ORDER BY created_at DESC, object_id DESC LIMIT 1 FOR UPDATE
        ) next_row WHERE previous.position < $2
      ), obsolete AS MATERIALIZED (
        SELECT candidates.* FROM candidates
        WHERE candidates.created_by_id = $3
          AND candidates.id <= $4::uuid AND candidates.created_at <= $5::timestamptz
        AND EXISTS (
          SELECT 1 FROM story_post_related_url_projection_jobs work
          WHERE work.post_id = $1 AND work.generation = $6 AND work.lease_token = $7
            AND work.lease_expires_at > clock_timestamp()
            AND work.eligibility_completed_at IS NOT NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM story_post_related_url_projection_receipts receipt
          WHERE receipt.post_id = $1 AND receipt.generation = $6
            AND receipt.url_id = candidates.object_id AND receipt.is_eligible = TRUE
        )
        AND NOT EXISTS (
          SELECT 1 FROM story_post_related_url_projection_relation_mutations mutation
          WHERE mutation.post_id = $1 AND mutation.generation = $6
            AND mutation.relation_id = candidates.id
        )
      )
      UPDATE relation__post__related__url relation
      SET deleted_at = CURRENT_TIMESTAMP, deleted_by_id = $3
      WHERE relation.subject_id = $1 AND relation.deleted_at IS NULL
        -- RANGE(subject_id) selects one leaf; candidate row locks keep its CTIDs stable.
        AND relation.ctid = ANY(ARRAY(SELECT row_tid FROM obsolete))
        AND relation.tableoid = ANY(ARRAY(SELECT table_oid FROM obsolete))`,
    [
      work.post_id,
      limit,
      storyTellerId,
      work.sweep_upper_bound_relation_id,
      work.relation_snapshot_at,
      work.generation,
      work.lease_token,
    ],
  )
  if (rowCount) {
    await recordPostRelatedUrlPublicationChanges(query, [work.post_id])
    await markStoryPostRelatedUrlProjectionInvalidationRequired(query, work)
  }
}
