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
    source_high_water_id: string | null
    relation_high_water_id: string | null
    relation_snapshot_at: Date
  }>(
    `/* markStoryPostRelatedUrlProjection:highWater */
      SELECT
        (SELECT id FROM rss_feed_items
         WHERE story_id = $1 AND deleted_at IS NULL
         ORDER BY id DESC LIMIT 1) AS source_high_water_id,
        (SELECT id FROM relation__post__related__url
         WHERE subject_id = $2 AND deleted_at IS NULL
         ORDER BY id DESC LIMIT 1) AS relation_high_water_id,
        clock_timestamp() AS relation_snapshot_at`,
    [storyId, postId],
  )
  const highWater = highWaterRows[0]!
  await query(
    `/* markStoryPostRelatedUrlProjection */
      INSERT INTO story_post_related_url_projection_jobs
        (post_id, story_id, source_high_water_id, relation_high_water_id, relation_snapshot_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (post_id) DO UPDATE
      SET story_id = EXCLUDED.story_id,
          generation = story_post_related_url_projection_jobs.generation + 1,
          source_high_water_id = EXCLUDED.source_high_water_id,
          relation_high_water_id = EXCLUDED.relation_high_water_id,
          relation_snapshot_at = EXCLUDED.relation_snapshot_at,
          source_cursor_id = NULL,
          source_completed_at = NULL,
          prune_cursor_id = NULL,
          lease_token = NULL, leased_at = NULL, lease_expires_at = NULL`,
    [
      postId,
      storyId,
      highWater.source_high_water_id,
      highWater.relation_high_water_id,
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
): Promise<ProjectionWork | null> {
  const { rows } = await write<ProjectionWork>(
    `/* claimStoryPostRelatedUrlProjection */
      WITH available AS (
        SELECT post_id FROM story_post_related_url_projection_jobs
        WHERE ($1::uuid IS NULL OR post_id = $1)
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
      RETURNING work.post_id, work.story_id, work.generation, work.source_high_water_id,
        work.relation_high_water_id, work.relation_snapshot_at, work.source_cursor_id,
        work.source_completed_at, work.prune_cursor_id, work.lease_token`,
    [postId ?? null, LEASE_SECONDS],
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
      SET source_cursor_id = $1
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
