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
    sweep_upper_bound_relation_id: string | null
    relation_snapshot_at: Date
  }>(
    `/* markStoryPostRelatedUrlProjection:highWater */
      SELECT
        (SELECT id FROM rss_feed_items
         WHERE story_id = $1 AND deleted_at IS NULL
         ORDER BY id DESC LIMIT 1) AS sweep_upper_bound_source_id,
        (SELECT id FROM relation__post__related__url
         WHERE subject_id = $2 AND deleted_at IS NULL
         ORDER BY id DESC LIMIT 1) AS sweep_upper_bound_relation_id,
        clock_timestamp() AS relation_snapshot_at`,
    [storyId, postId],
  )
  const highWater = highWaterRows[0]!
  await query(
    `/* markStoryPostRelatedUrlProjection */
      INSERT INTO story_post_related_url_projection_jobs
        (post_id, story_id, sweep_upper_bound_source_id, sweep_upper_bound_relation_id, relation_snapshot_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (post_id) DO UPDATE
      SET story_id = EXCLUDED.story_id,
          generation = story_post_related_url_projection_jobs.generation + 1,
          sweep_upper_bound_source_id = EXCLUDED.sweep_upper_bound_source_id,
          sweep_upper_bound_relation_id = EXCLUDED.sweep_upper_bound_relation_id,
          relation_snapshot_at = EXCLUDED.relation_snapshot_at,
          cursor_source_id = NULL,
          source_completed_at = NULL,
          cursor_prune_id = NULL,
          lease_token = NULL, leased_at = NULL, lease_expires_at = NULL`,
    [
      postId,
      storyId,
      highWater.sweep_upper_bound_source_id,
      highWater.sweep_upper_bound_relation_id,
      highWater.relation_snapshot_at,
    ],
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

export async function claimStoryPostRelatedUrlProjectionWork(
  postId?: string,
  postIds?: readonly string[],
): Promise<ProjectionWork | null> {
  if (postIds?.length === 0) return null
  const { rows } = await write<ProjectionWork>(
    `/* claimStoryPostRelatedUrlProjection */
      WITH available AS (
        SELECT post_id FROM story_post_related_url_projection_jobs
        WHERE ($1::uuid IS NULL OR post_id = $1)
          AND ($3::uuid[] IS NULL OR post_id = ANY($3::uuid[]))
          AND (lease_expires_at IS NULL OR lease_expires_at <= clock_timestamp())
        ORDER BY last_claimed_at NULLS FIRST, post_id LIMIT 1
      )
      UPDATE story_post_related_url_projection_jobs work
      SET lease_token = uuidv7(), leased_at = clock_timestamp(),
          last_claimed_at = clock_timestamp(),
          lease_expires_at = clock_timestamp() + ($2::integer * INTERVAL '1 second')
      FROM available
      WHERE work.post_id = available.post_id
        AND (work.lease_expires_at IS NULL OR work.lease_expires_at <= clock_timestamp())
      RETURNING work.post_id, work.story_id, work.generation, work.sweep_upper_bound_source_id,
        work.sweep_upper_bound_relation_id, work.relation_snapshot_at, work.cursor_source_id,
        work.source_completed_at, work.cursor_prune_id, work.lease_token`,
    [postId ?? null, LEASE_SECONDS, postIds ?? null],
  )
  return rows[0] ?? null
}

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

/** Checks for other unleased durable jobs before the dispatcher schedules one bounded follow-up. */
export async function hasClaimableStoryPostRelatedUrlProjectionWork(): Promise<boolean> {
  const { rows } = await write(
    `/* hasClaimableStoryPostRelatedUrlProjection */
      SELECT 1 FROM story_post_related_url_projection_jobs
      WHERE lease_expires_at IS NULL OR lease_expires_at <= clock_timestamp()
      LIMIT 1`,
  )
  return rows.length > 0
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

export async function advanceStoryPostRelatedUrlProjectionSourceCursor(
  work: ProjectionWork,
  cursor: string,
): Promise<boolean> {
  const { rowCount } = await write(
    `/* advanceStoryPostRelatedUrlProjectionSourceCursor */
      UPDATE story_post_related_url_projection_jobs
      SET cursor_source_id = $1
      WHERE post_id = $2 AND generation = $3 AND lease_token = $4
        AND lease_expires_at > clock_timestamp()`,
    [cursor, work.post_id, work.generation, work.lease_token],
  )
  return rowCount === 1
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
