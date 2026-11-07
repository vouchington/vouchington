import { write } from '@data-stores/psql'
import type { ProjectionWork } from './story-post-related-url-projection-types.mts'

const LEASE_SECONDS = 120

const claimReturning = `work.post_id, work.story_id, work.generation, work.sweep_upper_bound_source_id,
  work.source_completed_at, work.lease_token`

const availableJobs = `
  SELECT post_id FROM story_post_related_url_projection_jobs
  WHERE lease_expires_at IS NULL OR lease_expires_at <= clock_timestamp()
  ORDER BY last_claimed_at NULLS FIRST, post_id
  LIMIT 1`

export async function claimStoryPostRelatedUrlProjectionWork(): Promise<ProjectionWork | null> {
  const { rows } = await write<ProjectionWork>(
    `/* claimStoryPostRelatedUrlProjection */ WITH available AS (${availableJobs})
      UPDATE story_post_related_url_projection_jobs work
      SET lease_token = uuidv7(), leased_at = clock_timestamp(), last_claimed_at = clock_timestamp(),
          lease_expires_at = clock_timestamp() + ($1::integer * INTERVAL '1 second')
      FROM available WHERE work.post_id = available.post_id
        AND (work.lease_expires_at IS NULL OR work.lease_expires_at <= clock_timestamp())
      RETURNING ${claimReturning}`,
    [LEASE_SECONDS],
  )
  return rows[0] ?? null
}

export async function hasClaimableStoryPostRelatedUrlProjectionWork(): Promise<boolean> {
  const { rows } = await write(`/* hasClaimableStoryPostRelatedUrlProjection */ ${availableJobs}`)
  return rows.length > 0
}
