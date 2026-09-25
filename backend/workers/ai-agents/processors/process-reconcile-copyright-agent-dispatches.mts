import {
  applyNonSpamSignedInCopyrightFormScreening,
  getPendingCopyrightAgentDispatches,
  isCopyrightIntakeEnabled,
  type CopyrightAgentDispatch,
} from '@services/copyright-notices'
import { enqueueOrRetryCopyrightEmailIntake } from '@queues/ai-agents/enqueues/copyright-email-intake'
import { enqueueOrRetryCopyrightFormScreening } from '@queues/ai-agents/enqueues/copyright-form-screening'
import { enqueueOrRetryCopyrightAppealRecommendation } from '@queues/ai-agents/enqueues/copyright-appeal-recommendation'

export type ReconcileCopyrightAgentDispatchesDeps = {
  getPending: typeof getPendingCopyrightAgentDispatches
  enqueueEmail: typeof enqueueOrRetryCopyrightEmailIntake
  enqueueForm: typeof enqueueOrRetryCopyrightFormScreening
  applyFormEffect: typeof applyNonSpamSignedInCopyrightFormScreening
  enqueueAppeal: typeof enqueueOrRetryCopyrightAppealRecommendation
  isCopyrightIntakeEnabled: typeof isCopyrightIntakeEnabled
}

const defaultDeps: ReconcileCopyrightAgentDispatchesDeps = {
  getPending: getPendingCopyrightAgentDispatches,
  enqueueEmail: enqueueOrRetryCopyrightEmailIntake,
  enqueueForm: enqueueOrRetryCopyrightFormScreening,
  applyFormEffect: applyNonSpamSignedInCopyrightFormScreening,
  enqueueAppeal: enqueueOrRetryCopyrightAppealRecommendation,
  isCopyrightIntakeEnabled,
}

/**
 * Walks every page of pending copyright dispatches. One failed dispatch does not stop the others or
 * later pages; the job fails afterwards with every error so its retry covers what is still pending.
 */
export async function processReconcileCopyrightAgentDispatches(
  dependencyOverrides: Partial<ReconcileCopyrightAgentDispatchesDeps> = {},
): Promise<void> {
  const deps = { ...defaultDeps, ...dependencyOverrides }
  if (!deps.isCopyrightIntakeEnabled()) return
  const errors: unknown[] = []
  let cursor: string | undefined
  do {
    // oxlint-disable-next-line no-await-in-loop -- advance only after the page's dispatches settle.
    const page = await deps.getPending(cursor ? { after: cursor } : {})
    // oxlint-disable-next-line no-await-in-loop -- preserves at-least-once delivery before cursor advance.
    errors.push(...(await dispatchCopyrightAgentPage(page.results, deps)))
    cursor = page.page_info.end_cursor ?? undefined
  } while (cursor)
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Copyright agent dispatch reconciliation failed')
  }
}

async function dispatchCopyrightAgentPage(
  pending: readonly CopyrightAgentDispatch[],
  deps: ReconcileCopyrightAgentDispatchesDeps,
): Promise<unknown[]> {
  const enqueues = await Promise.allSettled(
    pending.flatMap(item => (item.kind === 'form-effect' ? [] : [enqueueDispatch(item, deps)])),
  )
  const errors: unknown[] = enqueues.flatMap(result =>
    result.status === 'rejected' ? [result.reason] : [],
  )
  for (const item of pending) {
    if (item.kind !== 'form-effect') continue
    try {
      // oxlint-disable-next-line no-await-in-loop -- each durable legal effect may lock targets.
      await deps.applyFormEffect(item.submissionId)
    } catch (error) {
      errors.push(error)
    }
  }
  return errors
}

function enqueueDispatch(
  item: Exclude<CopyrightAgentDispatch, { kind: 'form-effect' }>,
  deps: ReconcileCopyrightAgentDispatchesDeps,
): Promise<void> {
  if (item.kind === 'email') return deps.enqueueEmail(item.intakeId)
  if (item.kind === 'form-screening') return deps.enqueueForm(item.submissionId)
  return deps.enqueueAppeal(item.submissionId)
}
