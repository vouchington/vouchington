import type { TransactionQuery } from '@data-stores/psql/types'
import { relationLimitsMaxValues } from '@services/entity-relations/relation-limits-config'
import { recordPostRelatedUrlPublicationChanges } from '@services/entity-relations/post-topic-publication'
import { markStoryPostRelatedUrlProjectionInvalidationRequired } from './story-post-related-url-projection-invalidation.mts'
import type { ProjectionWork } from './story-post-related-url-projection-types.mts'

/**
 * Removes this post's projected related URLs that are outside the admitted prefix.
 * The active-set removal sets deleted_at because votes and the mutation fence reference the row.
 * The read is this post's story-teller rows on
 * idx_relation__post__related__url__subject__projection_source, limited to the hard maximum
 * the write guard can leave behind after a cap drop. Hand-added rows and mutation fences stay.
 */
export async function pruneStoryPostRelatedUrlsOutsidePrefix(
  query: TransactionQuery,
  work: ProjectionWork,
  storyTellerId: string,
  admittedUrlIds: readonly string[],
): Promise<void> {
  const { rows } = await query<{ subject_id: string }>(
    `/* pruneStoryPostRelatedUrlsOutsidePrefix */
      UPDATE relation__post__related__url AS relation
      SET deleted_at = CURRENT_TIMESTAMP, deleted_by_id = $2
      WHERE relation.subject_id = $1
        AND relation.id IN (
          SELECT projected.id
          FROM relation__post__related__url projected
          WHERE projected.subject_id = $1
            AND projected.deleted_at IS NULL
            AND projected.created_by_id = $2
            AND NOT (projected.object_id = ANY($3::uuid[]))
            AND NOT EXISTS (
              SELECT 1
              FROM story_post_related_url_projection_relation_mutations mutation
              WHERE mutation.post_id = projected.subject_id
                AND mutation.generation = $4
                AND mutation.relation_id = projected.id
            )
            AND EXISTS (
              SELECT 1
              FROM story_post_related_url_projection_jobs job
              WHERE job.post_id = projected.subject_id
                AND job.generation = $4
                AND job.lease_token = $5
                AND job.lease_expires_at > clock_timestamp()
            )
          LIMIT $6
        )
      RETURNING relation.subject_id`,
    [
      work.post_id,
      storyTellerId,
      admittedUrlIds,
      work.generation,
      work.lease_token,
      relationLimitsMaxValues.post_related_url,
    ],
  )
  if (rows.length === 0) return
  await recordPostRelatedUrlPublicationChanges(query, [work.post_id])
  await markStoryPostRelatedUrlProjectionInvalidationRequired(query, work)
}
