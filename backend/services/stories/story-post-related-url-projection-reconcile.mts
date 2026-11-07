import { getStoriesWorkLimit } from './work-limits.mts'
import { admitStoryPostRelatedUrlProjectionPrefix } from './story-post-related-url-projection-relations.mts'
import { drainStoryPostRelatedUrlProjectionInvalidation } from './story-post-related-url-projection-invalidation.mts'
import { drainPendingStoryPostRelatedUrlProjectionCrawlEffects } from './story-post-related-url-projection-relation-safety.mts'
import { runWithStoryPostRelatedUrlProjectionLeaseRenewal } from './story-post-related-url-projection-lease.mts'
import type {
  ProjectionResult,
  ProjectionWork,
} from './story-post-related-url-projection-types.mts'
import {
  cleanupStaleStoryPostRelatedUrlProjectionRelationMutations,
  cleanupStaleStoryPostRelatedUrlProjectionReceipts,
  hasStaleStoryPostRelatedUrlProjectionState,
} from './story-post-related-url-projection-cleanup.mts'
import {
  advanceStoryPostRelatedUrlProjectionSourcePhase,
  completeStoryPostRelatedUrlProjectionWork,
  isStoryPostRelatedUrlProjectionWorkCurrent,
  releaseStoryPostRelatedUrlProjectionWork,
} from './story-post-related-url-projection-work.mts'

type ProjectionPageResult = ProjectionResult & { completed?: true }

/** Processes one persisted lease; dispatch selection and continuation belong to the caller. */
export async function processStoryPostRelatedUrlProjectionPage(
  work: ProjectionWork,
): Promise<ProjectionPageResult> {
  try {
    if (!(await drainStoryPostRelatedUrlProjectionInvalidation(work)))
      return { processed: 0, continue: false }
    const recoveredCrawlEffects = await drainPendingStoryPostRelatedUrlProjectionCrawlEffects(work)
    if (recoveredCrawlEffects === null) return { processed: 0, continue: false }
    if (recoveredCrawlEffects > 0) return { processed: recoveredCrawlEffects, continue: true }
    if (!work.source_completed_at) return await projectPrefix(work)
    return await finishProjection(work)
  } finally {
    await releaseStoryPostRelatedUrlProjectionWork(work)
  }
}

async function projectPrefix(work: ProjectionWork): Promise<ProjectionResult> {
  const result = await runWithStoryPostRelatedUrlProjectionLeaseRenewal(work, async () =>
    admitStoryPostRelatedUrlProjectionPrefix(work),
  )
  if (!result?.value.ok) return { processed: 0, continue: false }
  await advanceStoryPostRelatedUrlProjectionSourcePhase(work)
  return { processed: result.value.processed, continue: true }
}

async function finishProjection(work: ProjectionWork): Promise<ProjectionPageResult> {
  const cleanupLimit = getStoriesWorkLimit('crawl_effect_page_size')
  const cleaned = await cleanupStaleStoryPostRelatedUrlProjectionReceipts(work, cleanupLimit)
  if (cleaned > 0) return { processed: cleaned, continue: true }
  const cleanedMutations = await cleanupStaleStoryPostRelatedUrlProjectionRelationMutations(
    work,
    cleanupLimit,
  )
  if (cleanedMutations > 0) return { processed: cleanedMutations, continue: true }
  if (!(await isStoryPostRelatedUrlProjectionWorkCurrent(work)))
    return { processed: 0, continue: false }
  if (await hasStaleStoryPostRelatedUrlProjectionState(work))
    return { processed: 0, continue: true }
  const completed = await completeStoryPostRelatedUrlProjectionWork(work)
  return {
    processed: 0,
    continue: false,
    ...(completed ? { completed: true as const } : {}),
  }
}
