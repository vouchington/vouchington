import { beginTransaction, write } from '@data-stores/psql'
import {
  getRelationLimitErrorCapacity,
  isRelationLimitError,
} from '@services/entity-relations/relation-limits'
import { lockPostPublicationPostScopes } from '@services/post-publication'
import { storyProjectionCapacity } from './story-post-related-url-projection-claim.mts'
import type {
  ProjectionResult,
  ProjectionWork,
} from './story-post-related-url-projection-types.mts'
import {
  isStoryPostRelatedUrlProjectionWorkCurrent,
  markStoryPostRelatedUrlProjection,
} from './story-post-related-url-projection-work.mts'

/** A changed capacity needs a fresh source and relation snapshot, not a resumed cursor. */
export async function restartLimitReachedStoryProjection(work: ProjectionWork): Promise<boolean> {
  await using query = await beginTransaction()
  await lockPostPublicationPostScopes(query, [work.post_id])
  if (!(await isStoryPostRelatedUrlProjectionWorkCurrent(work, query, true))) return false
  if (work.limit_reached_capacity === storyProjectionCapacity()) return false
  await markStoryPostRelatedUrlProjection(query, work.post_id, work.story_id)
  await query.commit()
  return true
}

/** Record the refused capacity only for the still-current generation and lease. */
export async function markStoryProjectionLimitReached(
  work: ProjectionWork,
  capacity: number,
): Promise<boolean> {
  if (storyProjectionCapacity() !== capacity) return false
  const { rowCount } = await write(
    `/* markStoryProjectionLimitReached */ UPDATE story_post_related_url_projection_jobs
     SET limit_reached_capacity = $1
     WHERE post_id = $2 AND generation = $3 AND lease_token = $4
       AND lease_expires_at > clock_timestamp()`,
    [capacity, work.post_id, work.generation, work.lease_token],
  )
  return rowCount === 1
}

async function handleStoryProjectionLimit(work: ProjectionWork, capacity: number) {
  if (storyProjectionCapacity() !== capacity) {
    const restarted = await restartLimitReachedStoryProjection(work)
    return { processed: 0, continue: restarted }
  }
  const terminal = await markStoryProjectionLimitReached(work, capacity)
  if (terminal) return { processed: 0, continue: false, completed: true as const }
  if (storyProjectionCapacity() !== capacity) {
    const restarted = await restartLimitReachedStoryProjection(work)
    return { processed: 0, continue: restarted }
  }
  return { processed: 0, continue: false }
}

/** Convert a refused source page into a fenced terminal or fresh-generation outcome. */
export async function runStoryProjectionSourceWithCapacityOutcome(
  work: ProjectionWork,
  run: (work: ProjectionWork) => Promise<ProjectionResult>,
) {
  try {
    return await run(work)
  } catch (err: unknown) {
    const capacity = getRelationLimitErrorCapacity(err)
    if (!isRelationLimitError(err) || capacity === undefined) throw err
    return handleStoryProjectionLimit(work, capacity)
  }
}
