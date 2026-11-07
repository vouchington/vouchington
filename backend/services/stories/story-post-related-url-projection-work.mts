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
  const { rows: highWaterRows } = await query<{
    sweep_upper_bound_source_id: string | null
  }>(
    `/* markStoryPostRelatedUrlProjection:highWater */
      SELECT
        -- no-mistakes-disable-next-line postgres-required-predicates: story membership can attach already-created items, so item IDs may predate story_id
        (SELECT id FROM rss_feed_items
         WHERE story_id = $1 AND deleted_at IS NULL
         ORDER BY id DESC LIMIT 1) AS sweep_upper_bound_source_id`,
    [storyId],
  )
  const highWater = highWaterRows[0]!
  await query(
    `/* markStoryPostRelatedUrlProjection */
      INSERT INTO story_post_related_url_projection_jobs
        (post_id, story_id, sweep_upper_bound_source_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (post_id) DO UPDATE
      SET story_id = EXCLUDED.story_id,
          generation = story_post_related_url_projection_jobs.generation + 1,
          sweep_upper_bound_source_id = EXCLUDED.sweep_upper_bound_source_id,
          source_completed_at = NULL,
          lease_token = NULL, leased_at = NULL, lease_expires_at = NULL`,
    [postId, storyId, highWater.sweep_upper_bound_source_id],
  )
  await query(
    `/* markStoryPostRelatedUrlProjection:transferMutations */
      INSERT INTO story_post_related_url_projection_relation_mutations
        (post_id, generation, relation_id)
      SELECT work.post_id, work.generation, mutation.relation_id
      FROM story_post_related_url_projection_jobs work
      JOIN story_post_related_url_projection_relation_mutations mutation
        ON mutation.post_id = work.post_id
       AND mutation.generation = work.generation - 1
      WHERE work.post_id = $1
      ORDER BY work.post_id, work.generation, mutation.relation_id
      ON CONFLICT (post_id, generation, relation_id) DO NOTHING`,
    [postId],
  )
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
  lock = false,
): Promise<boolean> {
  const statement = `/* storyPostRelatedUrlProjectionWorkFence */
    SELECT 1 FROM story_post_related_url_projection_jobs
    WHERE post_id = $1 AND generation = $2 AND lease_token = $3
      AND lease_expires_at > clock_timestamp()${lock ? ' FOR UPDATE' : ''}`
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
