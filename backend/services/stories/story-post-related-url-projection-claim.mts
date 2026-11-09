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

const availableJobsForPosts = `
  SELECT available.post_id FROM unnest($2::uuid[]) AS scope(post_id)
  CROSS JOIN LATERAL (
    SELECT work.post_id, work.last_claimed_at
    FROM story_post_related_url_projection_jobs work
    WHERE work.post_id = scope.post_id
      AND (work.lease_expires_at IS NULL OR work.lease_expires_at <= clock_timestamp())
    LIMIT 1
  ) available
  ORDER BY available.last_claimed_at NULLS FIRST, available.post_id
  LIMIT 1`

const claimableJobsForPosts = `
  SELECT 1 FROM unnest($1::uuid[]) AS scope(post_id)
  CROSS JOIN LATERAL (
    SELECT work.post_id
    FROM story_post_related_url_projection_jobs work
    WHERE work.post_id = scope.post_id
      AND (work.lease_expires_at IS NULL OR work.lease_expires_at <= clock_timestamp())
    LIMIT 1
  ) available
  LIMIT 1`

type StoryPostScope = { postIds?: readonly string[] }

export async function claimStoryPostRelatedUrlProjectionWork(
  scope?: StoryPostScope,
): Promise<ProjectionWork | null> {
  const postIds = scope?.postIds
  if (postIds?.length === 0) return null
  const scoped = postIds !== undefined
  const { rows } = await write<ProjectionWork>(
    `/* claimStoryPostRelatedUrlProjection${scoped ? ':scoped' : ''} */ WITH available AS (${scoped ? availableJobsForPosts : availableJobs})
      UPDATE story_post_related_url_projection_jobs work
      SET lease_token = uuidv7(), leased_at = clock_timestamp(), last_claimed_at = clock_timestamp(),
          lease_expires_at = clock_timestamp() + ($1::integer * INTERVAL '1 second')
      FROM available WHERE work.post_id = available.post_id
        AND (work.lease_expires_at IS NULL OR work.lease_expires_at <= clock_timestamp())
      RETURNING ${claimReturning}`,
    scoped ? [LEASE_SECONDS, postIds] : [LEASE_SECONDS],
  )
  return rows[0] ?? null
}

export async function hasClaimableStoryPostRelatedUrlProjectionWork(
  scope?: StoryPostScope,
): Promise<boolean> {
  const postIds = scope?.postIds
  if (postIds?.length === 0) return false
  const scoped = postIds !== undefined
  const query = `/* hasClaimableStoryPostRelatedUrlProjection${scoped ? ':scoped' : ''} */ ${scoped ? claimableJobsForPosts : availableJobs}`
  const { rows } = scoped ? await write(query, [postIds]) : await write(query)
  return rows.length > 0
}
