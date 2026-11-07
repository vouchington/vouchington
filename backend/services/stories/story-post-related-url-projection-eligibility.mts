import { write } from '@data-stores/psql'
import { runWithStoryPostRelatedUrlProjectionLeaseRenewal } from './story-post-related-url-projection-lease.mts'
import {
  decideStoryPostRelatedUrlProjectionRows,
  getStoryPostRelatedUrlProjectionSourcePageForWork,
  stageStoryPostRelatedUrlProjectionReceipts,
} from './story-post-related-url-projection-source.mts'
import { advanceStoryPostRelatedUrlProjectionSourceCursor } from './story-post-related-url-projection-work.mts'
import type {
  ProjectionResult,
  ProjectionWork,
} from './story-post-related-url-projection-types.mts'

/** Finish the bounded eligibility snapshot before absence of a receipt can authorize removal. */
export async function processStoryPostRelatedUrlProjectionEligibilityPage(
  work: ProjectionWork,
): Promise<ProjectionResult> {
  const result = await runWithStoryPostRelatedUrlProjectionLeaseRenewal(work, stageEligibilityPage)
  return result?.value ?? { processed: 0, continue: false }
}

async function stageEligibilityPage(work: ProjectionWork): Promise<ProjectionResult> {
  const rows = await getStoryPostRelatedUrlProjectionSourcePageForWork(work)
  if (rows.length === 0) {
    const { rowCount } = await write(
      `/* completeStoryPostRelatedUrlProjectionEligibility */
        UPDATE story_post_related_url_projection_jobs
        SET eligibility_completed_at = CURRENT_TIMESTAMP, cursor_source_id = NULL
        WHERE post_id = $1 AND generation = $2 AND lease_token = $3
          AND lease_expires_at > clock_timestamp()`,
      [work.post_id, work.generation, work.lease_token],
    )
    return { processed: 0, continue: rowCount === 1 }
  }
  const decisions = await decideStoryPostRelatedUrlProjectionRows(work, rows)
  if (!(await stageStoryPostRelatedUrlProjectionReceipts(work, decisions)))
    return { processed: 0, continue: false }
  const advanced = await advanceStoryPostRelatedUrlProjectionSourceCursor(work, rows.at(-1)!.id)
  return { processed: advanced ? rows.length : 0, continue: advanced }
}
