import { enqueueApplyCopyrightAction } from '@queues/notifications/enqueues'
import {
  createDueStatutoryCopyrightRestoreIntentsForDeadline,
  createMissingCopyrightEnforcementRequests,
  processCopyrightEnforcementRequest,
  recoverRejectedCopyrightFormReviewEffect,
  recoverBlockedCopyrightHoldRestorations,
  searchBlockedCopyrightHoldRestorationNoticeIds,
  searchDueStatutoryCopyrightRestorationDeadlineIds,
  searchReconcilableCopyrightEnforcementRequestIds,
  searchRecoverableCopyrightActionIntentIds,
  searchRecoverableCopyrightFormReviewIntakeIds,
} from '@services/copyright-notices'
import {
  enqueueEveryCopyrightSweepPage,
  runCopyrightSweepStage,
  settleCopyrightSweepSequentially,
  walkCopyrightSweep,
  type CopyrightSweepTally,
} from './copyright-sweep-walk.mts'

export type ReconcileCopyrightActionIntentsDeps = {
  searchFormReviews: typeof searchRecoverableCopyrightFormReviewIntakeIds
  recoverFormReview: typeof recoverRejectedCopyrightFormReviewEffect
  createMissingEnforcementRequests: typeof createMissingCopyrightEnforcementRequests
  searchEnforcementRequests: typeof searchReconcilableCopyrightEnforcementRequestIds
  processEnforcementRequest: typeof processCopyrightEnforcementRequest
  searchBlockedHoldRestorations: typeof searchBlockedCopyrightHoldRestorationNoticeIds
  recoverBlockedHoldRestorations: typeof recoverBlockedCopyrightHoldRestorations
  searchDueRestorations: typeof searchDueStatutoryCopyrightRestorationDeadlineIds
  createDueRestoreIntents: typeof createDueStatutoryCopyrightRestoreIntentsForDeadline
  searchActionIntents: typeof searchRecoverableCopyrightActionIntentIds
  enqueueApplyCopyrightAction: typeof enqueueApplyCopyrightAction
  now: () => Date
}

const defaultDeps: ReconcileCopyrightActionIntentsDeps = {
  searchFormReviews: searchRecoverableCopyrightFormReviewIntakeIds,
  recoverFormReview: recoverRejectedCopyrightFormReviewEffect,
  createMissingEnforcementRequests: createMissingCopyrightEnforcementRequests,
  searchEnforcementRequests: searchReconcilableCopyrightEnforcementRequestIds,
  processEnforcementRequest: processCopyrightEnforcementRequest,
  searchBlockedHoldRestorations: searchBlockedCopyrightHoldRestorationNoticeIds,
  recoverBlockedHoldRestorations: recoverBlockedCopyrightHoldRestorations,
  searchDueRestorations: searchDueStatutoryCopyrightRestorationDeadlineIds,
  createDueRestoreIntents: createDueStatutoryCopyrightRestoreIntentsForDeadline,
  searchActionIntents: searchRecoverableCopyrightActionIntentIds,
  enqueueApplyCopyrightAction,
  now: () => new Date(),
}

/**
 * Walks every page of each copyright action sweep in stage order: rejected form reviews, missing
 * enforcement requests, pending enforcement, blocked hold restorations, due statutory restorations,
 * then recoverable action intents. A failed item, page read, or stage does not stop the rest; the
 * job fails afterwards with every error so its retry covers what is still pending.
 */
export async function processReconcileCopyrightActionIntents(
  dependencyOverrides: Partial<ReconcileCopyrightActionIntentsDeps> = {},
): Promise<{ enqueued: number }> {
  const deps = { ...defaultDeps, ...dependencyOverrides }
  const evaluatedAt = deps.now()
  const tally: CopyrightSweepTally = { enqueued: 0, errors: [] }
  const stages = [
    () =>
      runCopyrightSweepStage(tally, () =>
        walkCopyrightSweep(
          page => deps.searchFormReviews(page),
          ids => settleCopyrightSweepSequentially(ids, id => deps.recoverFormReview(id)),
        ),
      ),
    () =>
      runCopyrightSweepStage(tally, async () => {
        await deps.createMissingEnforcementRequests()
        return []
      }),
    () =>
      runCopyrightSweepStage(tally, () =>
        walkCopyrightSweep(
          page => deps.searchEnforcementRequests(page),
          ids => settleCopyrightSweepSequentially(ids, id => deps.processEnforcementRequest(id)),
        ),
      ),
    () =>
      runCopyrightSweepStage(tally, () =>
        walkCopyrightSweep(
          page => deps.searchBlockedHoldRestorations(page),
          ids =>
            settleCopyrightSweepSequentially(ids, id =>
              deps.recoverBlockedHoldRestorations(id, evaluatedAt),
            ),
        ),
      ),
    () =>
      runCopyrightSweepStage(tally, () =>
        walkCopyrightSweep(
          page => deps.searchDueRestorations({ now: evaluatedAt, ...page }),
          ids =>
            settleCopyrightSweepSequentially(ids, id =>
              deps.createDueRestoreIntents(id, evaluatedAt),
            ),
        ),
      ),
    () =>
      enqueueEveryCopyrightSweepPage(
        tally,
        page => deps.searchActionIntents({ now: evaluatedAt, ...page }),
        id => deps.enqueueApplyCopyrightAction(id),
      ),
  ]
  for (const stage of stages) {
    // oxlint-disable-next-line no-await-in-loop -- each sweep consumes durable work produced by preceding stages.
    await stage()
  }
  if (tally.errors.length > 0) {
    throw new AggregateError(tally.errors, 'Copyright action reconciliation failed')
  }
  return { enqueued: tally.enqueued }
}
