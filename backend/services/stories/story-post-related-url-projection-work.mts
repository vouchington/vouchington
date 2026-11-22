import { refreshStoryPostRelatedUrlProjectionSources } from '@services/rss-feed-items/story-post-related-url-projections'
import { write } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import type { ProjectionWork } from './story-post-related-url-projection-types.mts'

const LEASE_SECONDS = 120
export const STORY_POST_RELATED_URL_PROJECTION_LEASE_RENEWAL_MS = 30_000

/** Creates or restarts durable exact URL projection in the caller's membership transaction. */
export async function markStoryPostRelatedUrlProjection(
  query: TransactionQuery,
  postId: string,
  storyId: string,
): Promise<void> {
  await query(
    `/* markStoryPostRelatedUrlProjection */
      INSERT INTO story_post_related_url_projection_jobs (post_id, story_id)
      VALUES ($1, $2)
      ON CONFLICT (post_id) DO UPDATE
      SET story_id = EXCLUDED.story_id,
          generation = story_post_related_url_projection_jobs.generation + 1,
          source_completed_at = NULL,
          lease_token = NULL, leased_at = NULL, lease_expires_at = NULL`,
    [postId, storyId],
  )
  await refreshStoryPostRelatedUrlProjectionSources(query, [postId])
}

export {
  claimStoryPostRelatedUrlProjectionWork,
  hasClaimableStoryPostRelatedUrlProjectionWork,
} from './story-post-related-url-projection-claim.mts'

export async function releaseStoryPostRelatedUrlProjectionWork(
  work: ProjectionWork,
): Promise<void> {
  await write(
    `/* releaseStoryPostRelatedUrlProjection */
      UPDATE story_post_related_url_projection_jobs
      SET lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
      WHERE post_id = $1 AND generation = $2 AND lease_token = $3
        AND lease_expires_at > clock_timestamp()`,
    [work.post_id, work.generation, work.lease_token],
  )
}

export async function renewStoryPostRelatedUrlProjectionWorkLease(
  work: ProjectionWork,
): Promise<boolean> {
  const { rowCount } = await write(
    `/* renewStoryPostRelatedUrlProjectionWorkLease */
      UPDATE story_post_related_url_projection_jobs
      SET lease_expires_at = clock_timestamp() + ($1::integer * INTERVAL '1 second')
      WHERE post_id = $2 AND generation = $3 AND lease_token = $4
        AND lease_expires_at > clock_timestamp()`,
    [LEASE_SECONDS, work.post_id, work.generation, work.lease_token],
  )
  return rowCount === 1
}

export async function isStoryPostRelatedUrlProjectionWorkCurrent(
  work: ProjectionWork,
  query?: TransactionQuery,
): Promise<boolean> {
  const statement = `/* storyPostRelatedUrlProjectionWorkFence */
    SELECT 1 FROM story_post_related_url_projection_jobs
    WHERE post_id = $1 AND generation = $2 AND lease_token = $3
      AND lease_expires_at > clock_timestamp()`
  const result = query
    ? await query(statement, [work.post_id, work.generation, work.lease_token])
    : await write(statement, [work.post_id, work.generation, work.lease_token])
  return result.rows.length === 1
}

export async function advanceStoryPostRelatedUrlProjectionSourcePhase(
  work: ProjectionWork,
): Promise<void> {
  await write(
    `/* advanceStoryPostRelatedUrlProjectionPhase */
      UPDATE story_post_related_url_projection_jobs SET source_completed_at = CURRENT_TIMESTAMP
      WHERE post_id = $1 AND generation = $2 AND lease_token = $3
        AND lease_expires_at > clock_timestamp()`,
    [work.post_id, work.generation, work.lease_token],
  )
}

export async function completeStoryPostRelatedUrlProjectionWork(
  work: ProjectionWork,
): Promise<boolean> {
  const { rowCount } = await write(
    `/* completeStoryPostRelatedUrlProjection */
      DELETE FROM story_post_related_url_projection_jobs
      WHERE post_id = $1 AND generation = $2 AND lease_token = $3
        AND lease_expires_at > clock_timestamp()`,
    [work.post_id, work.generation, work.lease_token],
  )
  return rowCount === 1
}
