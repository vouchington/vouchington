import type { TransactionQuery } from '@data-stores/psql/types'
import { recordPostRelatedUrlPublicationChanges } from '@services/entity-relations/post-topic-publication'
import { markStoryPostRelatedUrlProjectionInvalidationRequired } from './story-post-related-url-projection-invalidation.mts'
import type { ProjectionWork } from './story-post-related-url-projection-types.mts'

/**
 * Removes this post's projected related URLs that are outside the admitted prefix.
 * The active-set removal sets deleted_at because votes and the mutation fence reference the row.
 * One pass reads this post's live story-teller rows. The write guard keeps that set at or under
 * the hard maximum. Hand-added rows and mutation fences stay.
 */
export async function pruneStoryPostRelatedUrlsOutsidePrefix(
  query: TransactionQuery,
  work: ProjectionWork,
  storyTellerId: string,
  admittedUrlIds: readonly string[],
): Promise<void> {
  const { rows } = await query<{ subject_id: string }>(
    `/* pruneStoryPostRelatedUrlsOutsidePrefix */
      -- no-mistakes-disable-next-line postgres-bounded-statements: the relation write guard keeps this post's live story-teller rows at or under the post_related_url hard maximum of 10000; this pass must remove every projected URL outside the admitted prefix, and a LIMIT would leave outsiders attached
      UPDATE relation__post__related__url AS relation
      SET deleted_at = CURRENT_TIMESTAMP, deleted_by_id = $2
      WHERE relation.subject_id = $1
        AND relation.deleted_at IS NULL
        AND relation.created_by_id = $2
        AND NOT (relation.object_id = ANY($3::uuid[]))
        AND NOT EXISTS (
          SELECT 1
          FROM story_post_related_url_projection_relation_mutations mutation
          WHERE mutation.post_id = relation.subject_id
            AND mutation.generation = $4
            AND mutation.relation_id = relation.id
        )
        AND EXISTS (
          SELECT 1
          FROM story_post_related_url_projection_jobs job
          WHERE job.post_id = relation.subject_id
            AND job.generation = $4
            AND job.lease_token = $5
            AND job.lease_expires_at > clock_timestamp()
        )
      RETURNING relation.subject_id`,
    [work.post_id, storyTellerId, admittedUrlIds, work.generation, work.lease_token],
  )
  if (rows.length === 0) return
  await recordPostRelatedUrlPublicationChanges(query, [work.post_id])
  await markStoryPostRelatedUrlProjectionInvalidationRequired(query, work)
}
