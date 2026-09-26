import { enqueueApplyCopyrightAction } from '@queues/notifications/enqueues'
import {
  createDueStatutoryCopyrightRestoreIntentsForDeadline,
  createMissingCopyrightEnforcementRequests,
  processCopyrightEnforcementRequest,
  recoverRejectedCopyrightFormReviewEffect,
  searchDueStatutoryCopyrightRestorationDeadlineIds,
  searchReconcilableCopyrightEnforcementRequestIds,
  searchRecoverableCopyrightActionIntentIds,
  searchRecoverableCopyrightFormReviewIntakeIds,
  type CopyrightSweepIdPage,
} from '@services/copyright-notices'

export type ReconcileCopyrightActionIntentsDeps = {
  searchFormReviews: typeof searchRecoverableCopyrightFormReviewIntakeIds
  recoverFormReview: typeof recoverRejectedCopyrightFormReviewEffect
  createMissingEnforcementRequests: typeof createMissingCopyrightEnforcementRequests
  searchEnforcementRequests: typeof searchReconcilableCopyrightEnforcementRequestIds
  processEnforcementRequest: typeof processCopyrightEnforcementRequest
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
  searchDueRestorations: searchDueStatutoryCopyrightRestorationDeadlineIds,
  createDueRestoreIntents: createDueStatutoryCopyrightRestoreIntentsForDeadline,
  searchActionIntents: searchRecoverableCopyrightActionIntentIds,
  enqueueApplyCopyrightAction,
  now: () => new Date(),
}

/**
 * Walks every page of each copyright action sweep in stage order: rejected form reviews, missing
 * enforcement requests, pending enforcement, due statutory restorations, then recoverable action
 * intents. A failed item, page read, or stage does not stop the rest; the job fails afterwards with
 * every error so its retry covers what is still pending.
 */
export async function processReconcileCopyrightActionIntents(
  dependencyOverrides: Partial<ReconcileCopyrightActionIntentsDeps> = {},
): Promise<{ enqueued: number }> {
  const deps = { ...defaultDeps, ...dependencyOverrides }
  const evaluatedAt = deps.now()
  const errors: unknown[] = []
  let enqueued = 0
  // ast-grep-ignore: no-three-sequential-awaits -- each stage acts on rows the previous stage wrote
  await runStage(errors, () =>
    walkSweep(
      after => deps.searchFormReviews(pageAfter(after)),
      ids => settleSequentially(ids, id => deps.recoverFormReview(id)),
    ),
  )
  await runStage(errors, async () => {
    await deps.createMissingEnforcementRequests()
    return []
  })
  await runStage(errors, () =>
    walkSweep(
      after => deps.searchEnforcementRequests(pageAfter(after)),
      ids => settleSequentially(ids, id => deps.processEnforcementRequest(id)),
    ),
  )
  await runStage(errors, () =>
    walkSweep(
      after => deps.searchDueRestorations({ now: evaluatedAt, ...pageAfter(after) }),
      ids => settleSequentially(ids, id => deps.createDueRestoreIntents(id, evaluatedAt)),
    ),
  )
  await runStage(errors, () =>
    walkSweep(
      after => deps.searchActionIntents({ now: evaluatedAt, ...pageAfter(after) }),
      async ids => {
        const outcomes = await Promise.allSettled(
          ids.map(id => deps.enqueueApplyCopyrightAction(id)),
        )
        enqueued += outcomes.filter(outcome => outcome.status === 'fulfilled').length
        return outcomes.flatMap(outcome => (outcome.status === 'rejected' ? [outcome.reason] : []))
      },
    ),
  )
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Copyright action reconciliation failed')
  }
  return { enqueued }
}

async function runStage(errors: unknown[], stage: () => Promise<unknown[]>): Promise<void> {
  try {
    errors.push(...(await stage()))
  } catch (error) {
    errors.push(error)
  }
}

/** Settles each page before advancing past it; returns the item errors. */
async function walkSweep(
  searchPage: (after: string | undefined) => Promise<CopyrightSweepIdPage>,
  settlePage: (ids: readonly string[]) => Promise<unknown[]>,
): Promise<unknown[]> {
  const errors: unknown[] = []
  let cursor: string | undefined
  do {
    // oxlint-disable-next-line no-await-in-loop -- advance only after the page's items settle.
    const page = await searchPage(cursor)
    // oxlint-disable-next-line no-await-in-loop -- preserves at-least-once handling before cursor advance.
    errors.push(...(await settlePage(page.results)))
    cursor = page.page_info.end_cursor ?? undefined
  } while (cursor)
  return errors
}

async function settleSequentially(
  ids: readonly string[],
  settle: (id: string) => Promise<unknown>,
): Promise<unknown[]> {
  const errors: unknown[] = []
  for (const id of ids) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- each item takes its own row and advisory locks.
      await settle(id)
    } catch (error) {
      errors.push(error)
    }
  }
  return errors
}

function pageAfter(after: string | undefined): { after?: string } {
  return after ? { after } : {}
}
