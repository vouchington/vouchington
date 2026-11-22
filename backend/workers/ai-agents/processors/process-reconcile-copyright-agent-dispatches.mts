import { enqueueReconcileCopyrightAgentDispatchStage } from '@queues/ai-agents/enqueues/reconcile-copyright-agent-dispatches'
import {
  COPYRIGHT_AGENT_DISPATCH_JOBS,
  COPYRIGHT_AGENT_DISPATCH_STAGES,
  type CopyrightAgentDispatchStage,
} from '@queues/ai-agents/enqueues/copyright-agent-dispatch-stages'
import {
  applyNonSpamSignedInCopyrightFormScreening,
  getPendingCopyrightAgentDispatches,
  isCopyrightIntakeEnabled,
  type CopyrightAgentDispatch,
} from '@services/copyright-notices'
import { getCopyrightAgentDispatchLimits } from '@services/copyright-notices/work-limits'
import { admitCopyrightAppealRecommendationRuns } from '@services/copyright-notices/appeal-recommendation-runs'
import { admitCopyrightEmailRecommendationRuns } from '@services/copyright-notices/email-recommendation-runs'
import { admitCopyrightSubmissionGuidanceRuns } from '@services/copyright-notices/submission-guidance-runs'
import { enqueueCopyrightEmailIntakes } from '@queues/ai-agents/enqueues/copyright-email-intake'
import { enqueueCopyrightFormScreenings } from '@queues/ai-agents/enqueues/copyright-form-screening'
import { enqueueCopyrightAppealRecommendations } from '@queues/ai-agents/enqueues/copyright-appeal-recommendation'
import { enqueueCopyrightSubmissionGuidances } from '@queues/ai-agents/enqueues/copyright-submission-guidance'

/** Settles one page's subject ids and returns the error of every subject that failed. */
type PageSettler = (ids: readonly string[]) => Promise<unknown[]>

/**
 * One admission statement covers the page, then one bulk add enqueues every admitted run. A run
 * whose job is still in flight keeps its id and is skipped by the add. A failed run is already
 * marked in SQL by the worker, so the admission opens a new run with a new job id.
 */
function admitThenEnqueue<TItem>(
  admit: (ids: readonly string[]) => Promise<Map<string, string>>,
  enqueue: (items: readonly TItem[]) => Promise<unknown>,
  toItem: (id: string, runId: string) => TItem,
): PageSettler {
  return async ids => {
    const admitted = await admitRuns(admit, ids)
    const items = ids.flatMap(id => {
      const runId = admitted.runs.get(id)
      return runId ? [toItem(id, runId)] : []
    })
    const errors = await settleEnqueue(() => enqueue(items))
    return [...admitted.errors, ...errors]
  }
}

/** A failed bulk add keeps later pages moving; the next sweep re-adds from SQL state. */
async function settleEnqueue(enqueue: () => Promise<unknown>): Promise<unknown[]> {
  try {
    await enqueue()
    return []
  } catch (err) {
    return [err]
  }
}

/** A failed admission keeps later pages moving; the next sweep retries. */
async function admitRuns(
  admit: (ids: readonly string[]) => Promise<Map<string, string>>,
  ids: readonly string[],
): Promise<{ runs: Map<string, string>; errors: unknown[] }> {
  try {
    return { runs: await admit(ids), errors: [] }
  } catch (err) {
    return { runs: new Map(), errors: [err] }
  }
}

/**
 * A pending subject has no result: an admitted (or already active) run is what gets enqueued, and a
 * saved form effect starts no agent work, so each kind settles on its own.
 */
const pageSettlers: Record<CopyrightAgentDispatchStage, PageSettler> = {
  email: admitThenEnqueue(
    admitCopyrightEmailRecommendationRuns,
    enqueueCopyrightEmailIntakes,
    (intakeId, runId) => ({ intakeId, runId }),
  ),
  'form-screening': ids => settleEnqueue(() => enqueueCopyrightFormScreenings(ids)),
  'form-effect': async ids => {
    let errors: unknown[] = []
    for (const id of ids) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- each durable legal effect may lock targets.
        await applyNonSpamSignedInCopyrightFormScreening(id) // no-mistakes-disable-line query-reached-per-item: each durable legal effect locks its own submission targets and a page holds at most batchSize items
      } catch (err) {
        errors = errors.concat([err])
      }
    }
    return errors
  },
  appeal: admitThenEnqueue(
    admitCopyrightAppealRecommendationRuns,
    enqueueCopyrightAppealRecommendations,
    (submissionId, runId) => ({ submissionId, runId }),
  ),
  'submission-guidance': admitThenEnqueue(
    admitCopyrightSubmissionGuidanceRuns,
    enqueueCopyrightSubmissionGuidances,
    (submissionId, runId) => ({ submissionId, runId }),
  ),
}

function subjectId(item: CopyrightAgentDispatch): string {
  return item.kind === 'email' ? item.intakeId : item.submissionId
}

/**
 * `COPYRIGHT_INTAKE_ENABLED` closes new intake only. While it is off, the `email` and
 * `form-screening` stages wait so no new submission reaches a model; the pending rows stay and the
 * first sweep after enablement sends them. An `appeal`, `submission-guidance` and saved
 * `form-effect` belong to a case already open, so they run in either state.
 */
function isStageOpen(stage: CopyrightAgentDispatchStage): boolean {
  return (stage !== 'email' && stage !== 'form-screening') || isCopyrightIntakeEnabled()
}

async function reconcileStagePage(
  stage: CopyrightAgentDispatchStage,
  cursor: string | null | undefined,
  batchSize: number,
  ids?: readonly string[],
): Promise<{ errors: unknown[]; nextCursor: string | null | undefined }> {
  const page = await getPendingCopyrightAgentDispatches({
    ...(cursor ? { after: cursor } : {}),
    limit: batchSize,
    ids,
    kind: stage,
  })
  const errors = await pageSettlers[stage](page.results.map(subjectId))
  const nextCursor = page.page_info.has_next_page ? page.page_info.end_cursor : undefined
  return { errors, nextCursor }
}

/**
 * Processes capped pages of one kind of pending copyright dispatch. One failed dispatch does not stop
 * the others or later pages; a job that finds more enqueues its own continuation, then fails with
 * every error so its retry covers only this stage.
 */
function createStageProcessor(stage: CopyrightAgentDispatchStage) {
  return async function processReconcileCopyrightAgentDispatchStage(
    data: { after?: string } = {},
    options: { ids?: readonly string[]; batchSize?: number } = {},
  ): Promise<{ hasMore: boolean }> {
    if (!isStageOpen(stage)) return { hasMore: false }
    const { batchSize: defaultBatchSize, maxBatches } = getCopyrightAgentDispatchLimits(stage)
    const batchSize = options.batchSize ?? defaultBatchSize
    let cursor: string | null | undefined = data.after
    let errors: unknown[] = []
    for (let batch = 0; batch < maxBatches; batch++) {
      // oxlint-disable-next-line no-await-in-loop -- advance only after the page's dispatches settle.
      const result = await reconcileStagePage(stage, cursor, batchSize, options.ids)
      errors = errors.concat(result.errors)
      cursor = result.nextCursor
      if (!cursor) break
    }
    if (cursor) await enqueueReconcileCopyrightAgentDispatchStage(stage, { after: cursor })
    if (errors.length > 0) {
      throw new AggregateError(errors, `Copyright ${stage} agent dispatch reconciliation failed`)
    }
    return { hasMore: Boolean(cursor) }
  }
}

export const copyrightAgentDispatchProcessors = {
  email: createStageProcessor('email'),
  'form-screening': createStageProcessor('form-screening'),
  'form-effect': createStageProcessor('form-effect'),
  appeal: createStageProcessor('appeal'),
  'submission-guidance': createStageProcessor('submission-guidance'),
} as const satisfies Record<CopyrightAgentDispatchStage, unknown>

type StageJobName = (typeof COPYRIGHT_AGENT_DISPATCH_JOBS)[CopyrightAgentDispatchStage]['jobName']

/** The queue processor of each stage's job, keyed by job name. */
export const copyrightAgentDispatchJobProcessors = Object.fromEntries(
  COPYRIGHT_AGENT_DISPATCH_STAGES.map(stage => [
    COPYRIGHT_AGENT_DISPATCH_JOBS[stage].jobName,
    (job: { data: { after?: string } }) => copyrightAgentDispatchProcessors[stage](job.data),
  ]),
) as Record<StageJobName, (job: { data: { after?: string } }) => Promise<{ hasMore: boolean }>>
