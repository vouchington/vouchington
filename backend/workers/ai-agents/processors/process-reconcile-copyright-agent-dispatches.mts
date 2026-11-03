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

type ReconcileCopyrightAgentDispatchesDeps = {
  /** Lets a test scope the sweep to its own rows in a database shared with parallel tests. */
  getPending: typeof getPendingCopyrightAgentDispatches
}

const defaultDeps: ReconcileCopyrightAgentDispatchesDeps = {
  getPending: getPendingCopyrightAgentDispatches,
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
  data: CopyrightAgentSweepData = {},
  deps: ReconcileCopyrightAgentDispatchesDeps = defaultDeps,
): Promise<{ hasMore: boolean }> {
  const intakeEnabled = isCopyrightIntakeEnabled()
  const errors: unknown[] = []
  const { batchSize, maxBatches } = getCopyrightSweepLimits()
  let cursor = data.after
  for (let batch = 0; batch < maxBatches; batch++) {
    // oxlint-disable-next-line no-await-in-loop -- advance only after the page's dispatches settle.
    const page = await deps.getPending({ ...(cursor ? { after: cursor } : {}), limit: batchSize })
    const dispatches = intakeEnabled ? page.results : page.results.filter(isInCaseDispatch)
    // oxlint-disable-next-line no-await-in-loop -- preserves at-least-once delivery before cursor advance.
    errors.push(...(await dispatchCopyrightAgentPage(dispatches))) // no-mistakes-disable-line query-reached-per-item: capped at maxBatches pages and the cursor advances only after a page settles
    cursor = page.page_info.has_next_page ? (page.page_info.end_cursor ?? undefined) : undefined
    if (!cursor) break
  }
  if (cursor) await enqueueReconcileCopyrightAgentDispatches({ after: cursor })
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
): Promise<unknown[]> {
  const enqueues = await Promise.allSettled(
    pending.flatMap(item => (item.kind === 'form-effect' ? [] : [enqueueDispatch(item)])),
  )
  const errors: unknown[] = enqueues.flatMap(result =>
    result.status === 'rejected' ? [result.reason] : [],
  )
  for (const item of pending) {
    if (item.kind !== 'form-effect') continue
    try {
      // oxlint-disable-next-line no-await-in-loop -- each durable legal effect may lock targets.
      await applyNonSpamSignedInCopyrightFormScreening(item.submissionId) // no-mistakes-disable-line query-reached-per-item: each durable legal effect locks its own submission targets and a page holds at most batchSize items
    } catch (err) {
      errors.push(err)
    }
  }
  return errors
}

function enqueueDispatch(
  item: Exclude<CopyrightAgentDispatch, { kind: 'form-effect' }>,
): Promise<void> {
  if (item.kind === 'email') return enqueueOrRetryCopyrightEmailIntake(item.intakeId)
  if (item.kind === 'form-screening') return enqueueOrRetryCopyrightFormScreening(item.submissionId)
  if (item.kind === 'submission-guidance')
    return enqueueOrRetryCopyrightSubmissionGuidance(item.submissionId)
  return enqueueOrRetryCopyrightAppealRecommendation(item.submissionId)
}
