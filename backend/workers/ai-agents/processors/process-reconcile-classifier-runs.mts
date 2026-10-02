import { recordClassifierRunAlarm } from '@modules/on-error'
import {
  enqueueBulkClassifierRunDispatchers,
  enqueueBulkClassifierRuns,
  classifierRunJobExists,
} from '@queues/ai-agents/enqueues/classifier-run'
import { enqueueReconcileClassifierRunsPage } from '@queues/ai-agents/enqueues/reconcile-classifier-runs'
import type { ReconcileClassifierRunsJobData } from '@queues/ai-agents/types'
import { evaluateOpenAiSpendCapBreach } from '@services/ai-usage'
import {
  CLASSIFIER_RUN_SWEEP_ENQUEUE_BOUND,
  abandonClassifierRunSweep,
  listIncompleteClassifierRuns,
  recordClassifierRunSweepEnqueues,
  type IncompleteClassifierRun,
} from '@services/classifier-runs'
import type { ClassifierRunHandler } from './classifier-run-handler.mts'
import { checkClassifierRunHealth, type ReadClassifierRunHealth } from './classifier-run-health.mts'
import { getClassifierRunHandler, listClassifierRunHandlers } from './classifier-run-registry.mts'

export interface ReconcileClassifierRunsDependencies {
  /** Lets a test scope the sweep to its own runs in a database shared with parallel tests. */
  listIncomplete: typeof listIncompleteClassifierRuns
  handlers: () => readonly ClassifierRunHandler[]
  handlerFor: (classifier: string) => ClassifierRunHandler
  /** Lets a test scope each classifier's health read to its own rows. */
  readHealth: ReadClassifierRunHealth
  evaluateSpendCap: typeof evaluateOpenAiSpendCapBreach
}

export type ReconcileClassifierRunsResult =
  | { kind: 'spend-cap-breach' }
  | { kind: 'incomplete'; enqueued: number; abandoned: number; hasNext: boolean }
  | { kind: 'requests'; dispatched: number; hasNext: boolean }

const defaultDependencies: ReconcileClassifierRunsDependencies = {
  listIncomplete: listIncompleteClassifierRuns,
  handlers: listClassifierRunHandlers,
  handlerFor: getClassifierRunHandler,
  readHealth: (handler, now) => handler.health(now),
  evaluateSpendCap: evaluateOpenAiSpendCapBreach,
}

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
  overrides: Partial<ReconcileClassifierRunsDependencies> = {},
): Promise<ReconcileClassifierRunsResult> {
  const dependencies = { ...defaultDependencies, ...overrides }
  if (!data.phase) {
    await checkClassifierRunHealth(dependencies.handlers(), new Date(), dependencies.readHealth)
  }
  if (await dependencies.evaluateSpendCap()) return { kind: 'spend-cap-breach' }
  if (data.phase === 'requests') {
    if (!data.classifier) throw new Error('A request sweep page needs its classifier')
    return sweepRequests(dependencies.handlerFor(data.classifier), data.after ?? null)
  }
  if (!data.phase) {
    await Promise.all(
      dependencies.handlers().map(handler =>
        enqueueReconcileClassifierRunsPage({
          phase: 'requests',
          classifier: handler.slug,
          after: null,
        }),
      ),
    )
  }
  return sweepIncomplete(dependencies, data.after ?? null)
}

async function sweepRequests(
  handler: ClassifierRunHandler,
  after: string | null,
): Promise<ReconcileClassifierRunsResult> {
  const page = await handler.pendingRequests(after)
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
  dependencies: ReconcileClassifierRunsDependencies,
  after: string | null,
): Promise<ReconcileClassifierRunsResult> {
  const page = await dependencies.listIncomplete(after)
  const exhausted = page.items.filter(
    run => run.sweepEnqueueCount >= CLASSIFIER_RUN_SWEEP_ENQUEUE_BOUND,
  )
  const pending = page.items.filter(run => !exhausted.includes(run))
  const addedIds = new Set(await enqueueBulkClassifierRuns(pending.map(toRunJobData)))
  const added = pending.filter(run => addedIds.has(run.runId))
  await recordClassifierRunSweepEnqueues(added.map(run => run.runId))
  const outcomes = await Promise.all(exhausted.map(giveUpSweepRun))
  if (page.next) {
    await enqueueReconcileClassifierRunsPage({ phase: 'incomplete', after: page.next })
  }
  return {
    kind: 'incomplete',
    enqueued: added.length,
    abandoned: outcomes.filter(outcome => outcome === 'abandoned').length,
    hasNext: page.next !== null,
  }
}

/** Gives up a run at the bound once its last job is gone, and leaves it be while that job lives. */
async function giveUpSweepRun(
  run: IncompleteClassifierRun,
): Promise<'abandoned' | 'in-flight' | 'settled'> {
  if (await classifierRunJobExists(run.runId)) return 'in-flight'
  if ((await abandonClassifierRunSweep(run.runId)) === 'skipped') return 'settled'
  recordClassifierRunAlarm({
    kind: 'sweep-bound-exceeded',
    classifier: run.classifier,
    runId: run.runId,
    sweepEnqueueCount: run.sweepEnqueueCount,
  })
  return 'abandoned'
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
