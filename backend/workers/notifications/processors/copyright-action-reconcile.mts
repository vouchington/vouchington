import type { CopyrightSweepContinuation } from '@queues/notifications/types'
import {
  enqueueBulkApplyCopyrightActions,
  enqueueReconcileCopyrightActionIntents,
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
import {
  enqueueBulkCopyrightSweepPages,
  createCopyrightSweepBudget,
  runCopyrightSweepStage,
  settleCopyrightSweepSequentially,
  walkCopyrightSweep,
  type CopyrightSweepTally,
} from './copyright-sweep-walk.mts'

/**
 * Processes capped pages of each copyright action sweep in stage order: rejected form reviews, lost
 * decision assessments, pending enforcement, suspended claimants' pending automatic restrictions,
 * blocked hold restorations, due statutory restorations, then recoverable action intents. A failed item, page read, or stage does not stop the rest; the
 * job fails afterwards with every error so its retry covers what is still pending.
 * A native serialization failure stops the run immediately while preserving earlier faults.
 */
export async function processReconcileCopyrightActionIntents(
  data: CopyrightSweepContinuation = {},
  requestedIds?: readonly string[],
  batchSize?: number,
): Promise<{ enqueued: number; hasMore: boolean }> {
  const evaluatedAt = data.evaluatedAt ? new Date(data.evaluatedAt) : new Date()
  const cursors = new Map(Object.entries(data.cursors ?? {}))
  const budget = createCopyrightSweepBudget(batchSize)
  const deferred = new Set<string>()
  const options = (stage: string) => {
    const cursorAfter = cursors.get(stage) ?? undefined
    cursors.delete(stage)
    return {
      after: cursorAfter,
      singlePage: true,
      onPageReadError: () => {
        deferred.add(stage)
      },
      budget,
      onMore: (nextCursor?: string) => {
        cursors.set(stage, nextCursor ?? null)
      },
    }
  }
  const tally: CopyrightSweepTally = { enqueued: 0, errors: [] }
  const stages = [
    () =>
      runCopyrightSweepStage(tally, () =>
        walkCopyrightSweep(
          page => searchRecoverableCopyrightFormReviewIntakeIds({ ...page, ids: requestedIds }),
          ids =>
            settleCopyrightSweepSequentially(ids, id =>
              recoverRejectedCopyrightFormReviewEffect(id),
            ),
          options('forms'),
        ),
      ),
    () =>
      runCopyrightSweepStage(tally, () =>
        walkCopyrightSweep(
          page => recoverMissingDecisionAssessments({ ...page, ids: requestedIds }),
          async () => [],
          options('decisions'),
        ),
      ),
    () =>
      runCopyrightSweepStage(tally, () =>
        walkCopyrightSweep(
          page => searchPendingCopyrightEnforcementAssessmentIds({ ...page, ids: requestedIds }),
          ids => settleCopyrightSweepSequentially(ids, id => enforceCopyrightAssessment(id)),
          options('enforcement'),
        ),
      ),
    () =>
      runCopyrightSweepStage(tally, () =>
        walkCopyrightSweep(
          page =>
            searchSuspendedClaimantAutomaticRestrictionNoticeIds({ ...page, ids: requestedIds }),
          ids =>
            settleCopyrightSweepSequentially(ids, id =>
              liftSuspendedClaimantAutomaticRestrictions(id, evaluatedAt),
            ),
          options('suspended'),
        ),
      ),
    () =>
      runCopyrightSweepStage(tally, () =>
        walkCopyrightSweep(
          page => searchBlockedCopyrightHoldRestorationIntentIds({ ...page, ids: requestedIds }),
          ids =>
            settleCopyrightSweepSequentially(ids, id =>
              recoverBlockedCopyrightHoldRestoration(id, evaluatedAt),
            ),
          options('blocked'),
        ),
      ),
    () =>
      runCopyrightSweepStage(tally, () =>
        walkCopyrightSweep(
          page =>
            searchDueStatutoryCopyrightRestorationDeadlineIds({
              now: evaluatedAt,
              ...page,
              ids: requestedIds,
            }),
          (ids, page) =>
            settleCopyrightSweepSequentially(ids, id =>
              createDueStatutoryCopyrightRestoreIntentsForDeadline(
                page.candidates[id]!,
                evaluatedAt,
              ),
            ),
          options('restorations'),
        ),
      ),
    () =>
      enqueueBulkCopyrightSweepPages(
        tally,
        page =>
          searchRecoverableCopyrightActionIntentIds({
            now: evaluatedAt,
            ...page,
            ids: requestedIds,
          }),
        enqueueBulkApplyCopyrightActions,
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
  try {
    while (budget.remainingPages > 0 && pending.length > 0) {
      const name = pending.shift()!
      const index = names.indexOf(name)
      if (index < 0) throw new Error(`Unknown copyright sweep stage: ${name}`)
      // oxlint-disable-next-line no-await-in-loop -- rotate after each page under one shared job allowance.
      await stages[index]!()
      if (cursors.has(name) && !deferred.has(name)) pending.push(name)
    }
  } catch (err) {
    if ((err as { code?: string } | null)?.code === '40001' && tally.errors.length > 0)
      throw new AggregateError([...tally.errors, err], 'Copyright action reconciliation failed', {
        cause: err,
      })
    throw err
  }
  pending.push(...deferred)
  if (pending.length > 0)
    await enqueueReconcileCopyrightActionIntents({
      evaluatedAt: evaluatedAt.toISOString(),
      pending,
      cursors: Object.fromEntries(cursors),
    })
  if (tally.errors.length > 0) {
    throw new AggregateError(tally.errors, 'Copyright action reconciliation failed')
  }
  return { enqueued: tally.enqueued, hasMore: pending.length > 0 }
}
