import { write } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { invalidateStoriesStrict } from './cache-invalidation.mts'
import type { ProjectionWork } from './story-post-related-url-projection-types.mts'
import { isStoryPostRelatedUrlProjectionWorkCurrent } from './story-post-related-url-projection-work.mts'

export async function markStoryPostRelatedUrlProjectionInvalidationRequired(
  query: TransactionQuery,
  work: ProjectionWork,
): Promise<void> {
  await query(
    `/* markStoryPostRelatedUrlProjectionInvalidationRequired */
      UPDATE story_post_related_url_projection_jobs
      SET invalidation_required_at = CURRENT_TIMESTAMP, invalidation_completed_at = NULL
      WHERE post_id = $1 AND generation = $2 AND lease_token = $3
        AND lease_expires_at > clock_timestamp()`,
    [work.post_id, work.generation, work.lease_token],
  )
}

export async function drainStoryPostRelatedUrlProjectionInvalidation(
  work: ProjectionWork,
): Promise<boolean> {
  const { rows } = await write<{ invalidation_required_at: Date }>(
    `/* storyPostRelatedUrlProjectionPendingInvalidation */
      SELECT invalidation_required_at
      FROM story_post_related_url_projection_jobs
      WHERE post_id = $1 AND generation = $2 AND lease_token = $3
        AND lease_expires_at > clock_timestamp()
        AND invalidation_required_at IS NOT NULL
        AND (
          invalidation_completed_at IS NULL OR
          invalidation_completed_at < invalidation_required_at
        )`,
    [work.post_id, work.generation, work.lease_token],
  )
  const requiredAt = rows[0]?.invalidation_required_at
  if (!requiredAt) return isStoryPostRelatedUrlProjectionWorkCurrent(work)

  await invalidateStoriesStrict(work.story_id)
  const { rowCount } = await write(
    `/* completeStoryPostRelatedUrlProjectionInvalidation */
      UPDATE story_post_related_url_projection_jobs
      SET invalidation_completed_at = invalidation_required_at
      WHERE post_id = $1 AND generation = $2 AND lease_token = $3
        AND lease_expires_at > clock_timestamp()
        AND invalidation_required_at IS NOT NULL`,
    [work.post_id, work.generation, work.lease_token],
  )
  return rowCount === 1
}
