import type { CopyrightSweepContinuation } from '@queues/notifications/types'
import {
  enqueueApplyCopyrightAction,
  enqueueReconcileCopyrightActionIntents,
} from '@queues/notifications/enqueues'
import {
  createDueStatutoryCopyrightRestoreIntentsForDeadline,
  enforceCopyrightAssessment,
  liftSuspendedClaimantAutomaticRestrictions,
  recoverMissingDecisionAssessments,
  recoverRejectedCopyrightFormReviewEffect,
  recoverBlockedCopyrightHoldRestorations,
  searchBlockedCopyrightHoldRestorationNoticeIds,
  searchDueStatutoryCopyrightRestorationDeadlineIds,
  searchPendingCopyrightEnforcementAssessmentIds,
  searchRecoverableCopyrightActionIntentIds,
  searchRecoverableCopyrightFormReviewIntakeIds,
  searchSuspendedClaimantAutomaticRestrictionNoticeIds,
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
  recoverDecisionAssessments: typeof recoverMissingDecisionAssessments
  searchPendingEnforcement: typeof searchPendingCopyrightEnforcementAssessmentIds
  enforceAssessment: typeof enforceCopyrightAssessment
  searchSuspendedClaimantRestrictions: typeof searchSuspendedClaimantAutomaticRestrictionNoticeIds
  liftSuspendedClaimantRestrictions: typeof liftSuspendedClaimantAutomaticRestrictions
  searchBlockedHoldRestorations: typeof searchBlockedCopyrightHoldRestorationNoticeIds
  recoverBlockedHoldRestorations: typeof recoverBlockedCopyrightHoldRestorations
  searchDueRestorations: typeof searchDueStatutoryCopyrightRestorationDeadlineIds
  createDueRestoreIntents: typeof createDueStatutoryCopyrightRestoreIntentsForDeadline
  searchActionIntents: typeof searchRecoverableCopyrightActionIntentIds
  enqueueApplyCopyrightAction: typeof enqueueApplyCopyrightAction
  enqueueContinuation: typeof enqueueReconcileCopyrightActionIntents
  now: () => Date
}

const defaultDeps: ReconcileCopyrightActionIntentsDeps = {
  searchFormReviews: searchRecoverableCopyrightFormReviewIntakeIds,
  recoverFormReview: recoverRejectedCopyrightFormReviewEffect,
  recoverDecisionAssessments: recoverMissingDecisionAssessments,
  searchPendingEnforcement: searchPendingCopyrightEnforcementAssessmentIds,
  enforceAssessment: enforceCopyrightAssessment,
  searchSuspendedClaimantRestrictions: searchSuspendedClaimantAutomaticRestrictionNoticeIds,
  liftSuspendedClaimantRestrictions: liftSuspendedClaimantAutomaticRestrictions,
  searchBlockedHoldRestorations: searchBlockedCopyrightHoldRestorationNoticeIds,
  recoverBlockedHoldRestorations: recoverBlockedCopyrightHoldRestorations,
  searchDueRestorations: searchDueStatutoryCopyrightRestorationDeadlineIds,
  createDueRestoreIntents: createDueStatutoryCopyrightRestoreIntentsForDeadline,
  searchActionIntents: searchRecoverableCopyrightActionIntentIds,
  enqueueApplyCopyrightAction,
  enqueueContinuation: enqueueReconcileCopyrightActionIntents,
  now: () => new Date(),
}

/**
 * Processes capped pages of each copyright action sweep in stage order: rejected form reviews, lost
 * decision assessments, pending enforcement, suspended claimants' pending automatic restrictions,
 * blocked hold restorations, due statutory restorations, then recoverable action intents. A failed item, page read, or stage does not stop the rest; the
 * job fails afterwards with every error so its retry covers what is still pending.
 */
export async function processReconcileCopyrightActionIntents(
  dependencyOverrides: Partial<ReconcileCopyrightActionIntentsDeps> = {},
  data: CopyrightSweepContinuation = {},
): Promise<{ enqueued: number; hasMore: boolean }> {
  const deps = { ...defaultDeps, ...dependencyOverrides }
  const evaluatedAt = data.evaluatedAt ? new Date(data.evaluatedAt) : deps.now()
  const cursors: Record<string, string> = {}
  const options = (stage: string) => ({
    after: data.cursors?.[stage],
    skip: data.cursors !== undefined && !(stage in data.cursors),
    onMore: (after: string) => {
      cursors[stage] = after
    },
  })
  const tally: CopyrightSweepTally = { enqueued: 0, errors: [] }
  const stages = [
    () =>
      runCopyrightSweepStage(tally, () =>
        walkCopyrightSweep(
          page => deps.searchFormReviews(page),
          ids => settleCopyrightSweepSequentially(ids, id => deps.recoverFormReview(id)),
          options('forms'),
        ),
      ),
    () =>
      runCopyrightSweepStage(tally, () =>
        walkCopyrightSweep(
          page => deps.recoverDecisionAssessments(page),
          async () => [],
          options('decisions'),
        ),
      ),
    () =>
      runCopyrightSweepStage(tally, () =>
        walkCopyrightSweep(
          page => deps.searchPendingEnforcement(page),
          ids => settleCopyrightSweepSequentially(ids, id => deps.enforceAssessment(id)),
          options('enforcement'),
        ),
      ),
    () =>
      runCopyrightSweepStage(tally, () =>
        walkCopyrightSweep(
          page => deps.searchSuspendedClaimantRestrictions(page),
          ids =>
            settleCopyrightSweepSequentially(ids, id =>
              deps.liftSuspendedClaimantRestrictions(id, evaluatedAt),
            ),
          options('suspended'),
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
          options('blocked'),
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
          options('restorations'),
        ),
      ),
    () =>
      enqueueEveryCopyrightSweepPage(
        tally,
        page => deps.searchActionIntents({ now: evaluatedAt, ...page }),
        id => deps.enqueueApplyCopyrightAction(id),
        options('actions'),
      ),
  ]
  for (const stage of stages) {
    // oxlint-disable-next-line no-await-in-loop -- each sweep consumes durable work produced by preceding stages.
    await stage()
  }
  if (Object.keys(cursors).length > 0)
    await deps.enqueueContinuation({ evaluatedAt: evaluatedAt.toISOString(), cursors })
  if (tally.errors.length > 0) {
    throw new AggregateError(tally.errors, 'Copyright action reconciliation failed')
  }
  return { enqueued: tally.enqueued, hasMore: Object.keys(cursors).length > 0 }
}
