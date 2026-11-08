import { recordClassifierRunAlarm } from '@modules/on-error'
import {
  enqueueBulkClassifierRunDispatchers,
  enqueueBulkClassifierRuns,
  classifierRunJobsExist,
} from '@queues/ai-agents/enqueues/classifier-run'
import { enqueueReconcileClassifierRunsPage } from '@queues/ai-agents/enqueues/reconcile-classifier-runs'
import type { ReconcileClassifierRunsJobData } from '@queues/ai-agents/types'
import { evaluateSpendCapBreach } from '@services/ai-usage'
import {
  CLASSIFIER_RUN_SWEEP_ENQUEUE_BOUND,
  abandonClassifierRunSweeps,
  listIncompleteClassifierRuns,
  recordClassifierRunSweepEnqueues,
  type IncompleteClassifierRun,
  type ClassifierRunHealthScope,
} from '@services/classifier-runs'
import type { ClassifierRunHandler } from './classifier-run-handler.mts'
import { checkClassifierRunHealth } from './classifier-run-health.mts'
import { getClassifierRunHandler, listClassifierRunHandlers } from './classifier-run-registry.mts'

export type ClassifierRunReconcileScope = ClassifierRunHealthScope & {
  classifierSlugs?: readonly string[]
  now?: Date
}

export type ReconcileClassifierRunsResult =
  | { kind: 'spend-cap-breach' }
  | { kind: 'incomplete'; enqueued: number; abandoned: number; hasNext: boolean }
  | { kind: 'requests'; dispatched: number; hasNext: boolean }

/**
 * One page of the recovery sweep, from durable state alone. A scheduled tick first reads every
 * classifier's receipt health and alarms on what crossed a threshold (including while the spend
 * cap parks the queue, so a parked backlog is still seen), then starts the request phase of every
 * classifier and sweeps the first page of incomplete runs; each full page chains the next page
 * under a stable job id, so a large backlog drains across jobs and overlapping sweeps converge. A
 * spend-cap breach stops the sweep before it enqueues anything.
 */
export async function processReconcileClassifierRuns(
  data: ReconcileClassifierRunsJobData,
  scope: ClassifierRunReconcileScope = {},
  batchSize?: number,
): Promise<ReconcileClassifierRunsResult> {
  const handlers = listClassifierRunHandlers().filter(
    handler => scope.classifierSlugs === undefined || scope.classifierSlugs.includes(handler.slug),
  )
  if (!data.phase) {
    await checkClassifierRunHealth(handlers, scope.now ?? new Date(), scope)
  }
  if (await evaluateSpendCapBreach()) return { kind: 'spend-cap-breach' }
  if (data.phase === 'requests') {
    if (!data.classifier) throw new Error('A request sweep page needs its classifier')
    return sweepRequests(
      getClassifierRunHandler(data.classifier),
      data.after ?? null,
      scope,
      batchSize,
    )
  }
  if (!data.phase) {
    await Promise.all(
      handlers.map(handler =>
        enqueueReconcileClassifierRunsPage({
          phase: 'requests',
          classifier: handler.slug,
          after: null,
        }),
      ),
    )
  }
  return sweepIncomplete(data.after ?? null, scope.runIds, batchSize)
}

async function sweepRequests(
  handler: ClassifierRunHandler,
  after: string | null,
  scope: ClassifierRunHealthScope,
  batchSize: number | undefined,
): Promise<ReconcileClassifierRunsResult> {
  const page = await handler.pendingRequests(after, scope, batchSize)
  await enqueueBulkClassifierRunDispatchers(
    page.items.map(item => ({
      classifier: handler.slug,
      postId: item.postId,
      rssFeedItemId: item.rssFeedItemId,
    })),
  )
  if (page.next) {
    await enqueueReconcileClassifierRunsPage({
      phase: 'requests',
      classifier: handler.slug,
      after: page.next,
    })
  }
  return { kind: 'requests', dispatched: page.items.length, hasNext: page.next !== null }
}

/**
 * Re-enqueues every recoverable run whose job is gone. Each enqueue that actually adds a job is
 * counted; a run whose last permitted job has disappeared is given up with an alarm rather than
 * retried forever. Run and request age alarms come from the health check, not from these pages.
 */
async function sweepIncomplete(
  after: string | null,
  runIds: readonly string[] | undefined,
  batchSize: number | undefined,
): Promise<ReconcileClassifierRunsResult> {
  const page = await listIncompleteClassifierRuns(after, batchSize, runIds)
  const exhausted = page.items.filter(
    run => run.sweepEnqueueCount >= CLASSIFIER_RUN_SWEEP_ENQUEUE_BOUND,
  )
  const pending = page.items.filter(run => !exhausted.includes(run))
  const addedIds = new Set(await enqueueBulkClassifierRuns(pending.map(toRunJobData)))
  const added = pending.filter(run => addedIds.has(run.runId))
  await recordClassifierRunSweepEnqueues(added.map(run => run.runId))
  const abandoned = await giveUpSweepRuns(exhausted)
  if (page.next) {
    await enqueueReconcileClassifierRunsPage({ phase: 'incomplete', after: page.next })
  }
  return {
    kind: 'incomplete',
    enqueued: added.length,
    abandoned: abandoned.length,
    hasNext: page.next !== null,
  }
}

/** Gives up runs at the bound once their last job is gone, and leaves a run be while its job lives. */
async function giveUpSweepRuns(
  exhausted: readonly IncompleteClassifierRun[],
): Promise<IncompleteClassifierRun[]> {
  const live = await classifierRunJobsExist(exhausted.map(run => run.runId))
  const gone = exhausted.filter(run => !live.has(run.runId))
  const abandonedIds = new Set(await abandonClassifierRunSweeps(gone.map(run => run.runId)))
  const abandoned = gone.filter(run => abandonedIds.has(run.runId))
  for (const run of abandoned) {
    recordClassifierRunAlarm({
      kind: 'sweep-bound-exceeded',
      classifier: run.classifier,
      runId: run.runId,
      sweepEnqueueCount: run.sweepEnqueueCount,
    })
  }
  return abandoned
}

function toRunJobData(run: IncompleteClassifierRun) {
  return {
    classifier: run.classifier,
    runId: run.runId,
    postId: run.postId,
    rssFeedItemId: run.rssFeedItemId,
    inputSha256: run.inputSha256,
    configurationSha256: run.configurationSha256,
  }
}
