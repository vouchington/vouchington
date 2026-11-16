import type {
  CopyrightActionReconcileData,
  CopyrightActionReconcileStage,
} from '@queues/notifications/types'
import {
  enqueueBulkApplyCopyrightActions,
  enqueueReconcileCopyrightActionStage,
} from '@queues/notifications/enqueues'
import {
  createDueStatutoryCopyrightRestoreIntentsForDeadline,
  enforceCopyrightAssessment,
  liftSuspendedClaimantAutomaticRestrictions,
  recoverMissingDecisionAssessments,
  recoverRejectedCopyrightFormReviewEffect,
  recoverBlockedCopyrightHoldRestoration,
  searchBlockedCopyrightHoldRestorationIntentIds,
  searchDueStatutoryCopyrightRestorationDeadlineIds,
  searchPendingCopyrightEnforcementAssessmentIds,
  searchRecoverableCopyrightActionIntentIds,
  searchRecoverableCopyrightFormReviewIntakeIds,
  searchSuspendedClaimantAutomaticRestrictionNoticeIds,
} from '@services/copyright-notices'
import { getCopyrightSweepLimits } from '@services/copyright-notices/work-limits'
import {
  settleCopyrightSweepByBulkEnqueue,
  settleCopyrightSweepSequentially,
  walkCopyrightSweep,
  type CopyrightSweepWalkOptions,
  type CopyrightSweepWalkResult,
} from './copyright-sweep-walk.mts'

type StageWalk = (
  evaluatedAt: Date,
  requestedIds: readonly string[] | undefined,
  options: CopyrightSweepWalkOptions,
) => Promise<CopyrightSweepWalkResult>

/** How each stage reads its committed candidates and settles them; each is idempotent. */
const stageWalks: Record<CopyrightActionReconcileStage, StageWalk> = {
  forms: (_evaluatedAt, ids, options) =>
    walkCopyrightSweep(
      page => searchRecoverableCopyrightFormReviewIntakeIds({ ...page, ids }),
      pageIds =>
        settleCopyrightSweepSequentially(pageIds, recoverRejectedCopyrightFormReviewEffect),
      options,
    ),
  decisions: (_evaluatedAt, ids, options) =>
    walkCopyrightSweep(
      page => recoverMissingDecisionAssessments({ ...page, ids }),
      async () => ({ errors: [], enqueued: 0 }),
      options,
    ),
  enforcement: (_evaluatedAt, ids, options) =>
    walkCopyrightSweep(
      page => searchPendingCopyrightEnforcementAssessmentIds({ ...page, ids }),
      pageIds => settleCopyrightSweepSequentially(pageIds, enforceCopyrightAssessment),
      options,
    ),
  suspended: (evaluatedAt, ids, options) =>
    walkCopyrightSweep(
      page => searchSuspendedClaimantAutomaticRestrictionNoticeIds({ ...page, ids }),
      pageIds =>
        settleCopyrightSweepSequentially(pageIds, id =>
          liftSuspendedClaimantAutomaticRestrictions(id, evaluatedAt),
        ),
      options,
    ),
  blocked: (evaluatedAt, ids, options) =>
    walkCopyrightSweep(
      page => searchBlockedCopyrightHoldRestorationIntentIds({ ...page, ids }),
      pageIds =>
        settleCopyrightSweepSequentially(pageIds, id =>
          recoverBlockedCopyrightHoldRestoration(id, evaluatedAt),
        ),
      options,
    ),
  restorations: (evaluatedAt, ids, options) =>
    walkCopyrightSweep(
      page => searchDueStatutoryCopyrightRestorationDeadlineIds({ now: evaluatedAt, ...page, ids }),
      (pageIds, page) =>
        settleCopyrightSweepSequentially(pageIds, id =>
          createDueStatutoryCopyrightRestoreIntentsForDeadline(page.candidates[id]!, evaluatedAt),
        ),
      options,
    ),
  actions: (evaluatedAt, ids, options) =>
    walkCopyrightSweep(
      page => searchRecoverableCopyrightActionIntentIds({ now: evaluatedAt, ...page, ids }),
      settleCopyrightSweepByBulkEnqueue(enqueueBulkApplyCopyrightActions),
      options,
    ),
}

/**
 * Walks one stage's capped pages. A job that finds more enqueues its own continuation from the
 * saved cursor, then fails with every item error so its retry covers only this stage. A failed
 * page read fails the job and its retry resumes from the job's own cursor.
 */
function createStageProcessor(stage: CopyrightActionReconcileStage) {
  return async function processReconcileCopyrightActionStage(
    data: CopyrightActionReconcileData = {},
    requestedIds?: readonly string[],
  ): Promise<{ enqueued: number; hasMore: boolean }> {
    const evaluatedAt = data.evaluatedAt ? new Date(data.evaluatedAt) : new Date()
    const walked = await stageWalks[stage](evaluatedAt, requestedIds, {
      after: data.after,
      limits: getCopyrightSweepLimits(stage),
    })
    if (walked.after !== undefined)
      await enqueueReconcileCopyrightActionStage(stage, {
        evaluatedAt: evaluatedAt.toISOString(),
        after: walked.after,
      })
    if (walked.errors.length > 0) {
      throw new AggregateError(walked.errors, `Copyright ${stage} reconciliation failed`)
    }
    return { enqueued: walked.enqueued, hasMore: walked.after !== undefined }
  }
}

export const copyrightActionReconcileProcessors = {
  forms: createStageProcessor('forms'),
  decisions: createStageProcessor('decisions'),
  enforcement: createStageProcessor('enforcement'),
  suspended: createStageProcessor('suspended'),
  blocked: createStageProcessor('blocked'),
  restorations: createStageProcessor('restorations'),
  actions: createStageProcessor('actions'),
} as const satisfies Record<CopyrightActionReconcileStage, unknown>
