import { write } from '@data-stores/psql'
import { getRelationTypeLimit } from '@services/entity-relations/relation-limits-config'
import type { ProjectionWork } from './story-post-related-url-projection-types.mts'

const LEASE_SECONDS = 120

export function storyProjectionCapacity(): number {
  const limit = getRelationTypeLimit('relation__post__related__url')
  if (limit === null) throw new Error('Missing post related URL limit')
  return limit
}

// Each ordered branch takes one candidate; equal-cap terminal rows are skipped by index ranges.
const candidateQuery = `
  SELECT post_id, last_claimed_at FROM (
    (SELECT post_id, last_claimed_at FROM story_post_related_url_projection_jobs
      WHERE limit_reached_capacity IS NULL
        AND (lease_expires_at IS NULL OR lease_expires_at <= clock_timestamp())
      ORDER BY last_claimed_at NULLS FIRST, post_id LIMIT 1)
    UNION ALL
    (SELECT post_id, last_claimed_at FROM story_post_related_url_projection_jobs
      WHERE limit_reached_capacity < $1::integer
        AND (lease_expires_at IS NULL OR lease_expires_at <= clock_timestamp())
      ORDER BY limit_reached_capacity, last_claimed_at, post_id LIMIT 1)
    UNION ALL
    (SELECT post_id, last_claimed_at FROM story_post_related_url_projection_jobs
      WHERE limit_reached_capacity > $1::integer
        AND (lease_expires_at IS NULL OR lease_expires_at <= clock_timestamp())
      ORDER BY limit_reached_capacity DESC, last_claimed_at DESC, post_id DESC LIMIT 1)
  ) candidates ORDER BY last_claimed_at NULLS FIRST, post_id LIMIT 1`

export async function claimStoryPostRelatedUrlProjectionWork(): Promise<ProjectionWork | null> {
  const { rows } = await write<ProjectionWork>(
    `/* claimStoryPostRelatedUrlProjection */ WITH available AS (${candidateQuery})
      UPDATE story_post_related_url_projection_jobs work
      SET lease_token = uuidv7(), leased_at = clock_timestamp(), last_claimed_at = clock_timestamp(),
          lease_expires_at = clock_timestamp() + ($2::integer * INTERVAL '1 second')
      FROM available WHERE work.post_id = available.post_id
        AND (work.lease_expires_at IS NULL OR work.lease_expires_at <= clock_timestamp())
        AND (work.limit_reached_capacity IS NULL OR work.limit_reached_capacity <> $1::integer)
      RETURNING work.post_id, work.story_id, work.generation, work.sweep_upper_bound_source_id,
        work.sweep_upper_bound_relation_id, work.relation_snapshot_at, work.cursor_source_id,
        work.eligibility_completed_at, work.source_completed_at, work.cursor_prune_id,
        work.limit_reached_capacity, work.lease_token`,
    [storyProjectionCapacity(), LEASE_SECONDS],
  )
  return rows[0] ?? null
}

export async function hasClaimableStoryPostRelatedUrlProjectionWork(): Promise<boolean> {
  const { rows } = await write(
    `/* hasClaimableStoryPostRelatedUrlProjection */ ${candidateQuery}`,
    [storyProjectionCapacity()],
  )
  return rows.length > 0
}
