import { getCopyrightSweepLimits } from '@services/copyright-notices/work-limits'
import { enqueueReconcileCopyrightAgentDispatches } from '@queues/ai-agents/enqueues/reconcile-copyright-agent-dispatches'
import type { CopyrightAgentSweepData } from '@queues/ai-agents/types'
import {
  applyNonSpamSignedInCopyrightFormScreening,
  getPendingCopyrightAgentDispatches,
  isCopyrightIntakeEnabled,
  type CopyrightAgentDispatch,
} from '@services/copyright-notices'
import { enqueueOrRetryCopyrightEmailIntake } from '@queues/ai-agents/enqueues/copyright-email-intake'
import { enqueueOrRetryCopyrightFormScreening } from '@queues/ai-agents/enqueues/copyright-form-screening'
import { enqueueOrRetryCopyrightAppealRecommendation } from '@queues/ai-agents/enqueues/copyright-appeal-recommendation'
import { enqueueOrRetryCopyrightSubmissionGuidance } from '@queues/ai-agents/enqueues/copyright-submission-guidance'

export type ReconcileCopyrightAgentDispatchesDeps = {
  enqueueContinuation: typeof enqueueReconcileCopyrightAgentDispatches
  getPending: typeof getPendingCopyrightAgentDispatches
  enqueueEmail: typeof enqueueOrRetryCopyrightEmailIntake
  enqueueForm: typeof enqueueOrRetryCopyrightFormScreening
  applyFormEffect: typeof applyNonSpamSignedInCopyrightFormScreening
  enqueueAppeal: typeof enqueueOrRetryCopyrightAppealRecommendation
  enqueueSubmissionGuidance: typeof enqueueOrRetryCopyrightSubmissionGuidance
}

const defaultDeps: ReconcileCopyrightAgentDispatchesDeps = {
  enqueueContinuation: enqueueReconcileCopyrightAgentDispatches,
  getPending: getPendingCopyrightAgentDispatches,
  enqueueEmail: enqueueOrRetryCopyrightEmailIntake,
  enqueueForm: enqueueOrRetryCopyrightFormScreening,
  applyFormEffect: applyNonSpamSignedInCopyrightFormScreening,
  enqueueAppeal: enqueueOrRetryCopyrightAppealRecommendation,
  enqueueSubmissionGuidance: enqueueOrRetryCopyrightSubmissionGuidance,
}

/**
 * Processes capped pages of pending copyright dispatches. One failed dispatch does not stop the others or
 * later pages; the job fails afterwards with every error so its retry covers what is still pending.
 *
 * `COPYRIGHT_INTAKE_ENABLED` closes new intake only. While it is off, the `email` and
 * `form-screening` dispatches wait so no new submission reaches a model. An `appeal` and a saved
 * `form-effect` belong to a case already open, so they run in either state.
 */
export async function processReconcileCopyrightAgentDispatches(
  dependencyOverrides: Partial<ReconcileCopyrightAgentDispatchesDeps> = {},
  data: CopyrightAgentSweepData = {},
): Promise<{ hasMore: boolean }> {
  const deps = { ...defaultDeps, ...dependencyOverrides }
  const intakeEnabled = isCopyrightIntakeEnabled()
  const errors: unknown[] = []
  const { batchSize, maxBatches } = getCopyrightSweepLimits()
  let cursor = data.after
  for (let batch = 0; batch < maxBatches; batch++) {
    // oxlint-disable-next-line no-await-in-loop -- advance only after the page's dispatches settle.
    const page = await deps.getPending({ ...(cursor ? { after: cursor } : {}), limit: batchSize })
    const dispatches = intakeEnabled ? page.results : page.results.filter(isInCaseDispatch)
    // oxlint-disable-next-line no-await-in-loop -- preserves at-least-once delivery before cursor advance.
    errors.push(...(await dispatchCopyrightAgentPage(dispatches, deps)))
    cursor = page.page_info.has_next_page ? (page.page_info.end_cursor ?? undefined) : undefined
    if (!cursor) break
  }
  if (cursor) await deps.enqueueContinuation({ after: cursor })
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Copyright agent dispatch reconciliation failed')
  }
  return { hasMore: cursor !== undefined }
}

function isInCaseDispatch(item: CopyrightAgentDispatch): boolean {
  return item.kind !== 'email' && item.kind !== 'form-screening'
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
    } catch (err) {
      errors.push(err)
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
  if (item.kind === 'submission-guidance') return deps.enqueueSubmissionGuidance(item.submissionId)
  return deps.enqueueAppeal(item.submissionId)
}
