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
  createCopyrightSweepBudget,
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
  const cursors = new Map(Object.entries(data.cursors ?? {}))
  const budget = createCopyrightSweepBudget()
  const deferred = new Set<string>()
  const options = (stage: string) => {
    const after = cursors.get(stage) ?? undefined
    cursors.delete(stage)
    return {
      after,
      singlePage: true,
      onPageReadError: () => {
        deferred.add(stage)
      },
      budget,
      onMore: (after?: string) => {
        cursors.set(stage, after ?? null)
      },
    }
  }
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
  const names = [
    'forms',
    'decisions',
    'enforcement',
    'suspended',
    'blocked',
    'restorations',
    'actions',
  ]
  const pending = [...(data.pending ?? names)]
  while (budget.remainingPages > 0 && pending.length > 0) {
    const name = pending.shift()!
    const index = names.indexOf(name)
    if (index < 0) throw new Error(`Unknown copyright sweep stage: ${name}`)
    // oxlint-disable-next-line no-await-in-loop -- rotate after each page under one shared job allowance.
    await stages[index]!()
    if (cursors.has(name) && !deferred.has(name)) pending.push(name)
  }
  pending.push(...deferred)
  if (pending.length > 0)
    await deps.enqueueContinuation({
      evaluatedAt: evaluatedAt.toISOString(),
      pending,
      cursors: Object.fromEntries(cursors),
    })
  if (tally.errors.length > 0) {
    throw new AggregateError(tally.errors, 'Copyright action reconciliation failed')
  }
  return { enqueued: tally.enqueued, hasMore: pending.length > 0 }
}
