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
import { getClassifierRunHandler, listClassifierRunHandlers } from './classifier-run-registry.mts'

/**
 * Longer than any legitimate delay: the spend cap parks a job until day end, so a healthy run can
 * wait most of a day. C12 (#225) owns run-health alarms and this threshold going forward.
 */
export const CLASSIFIER_RUN_AGE_ALARM_MS = 26 * 60 * 60 * 1000

export interface ReconcileClassifierRunsDependencies {
  /** Lets a test scope the sweep to its own runs in a database shared with parallel tests. */
  listIncomplete: typeof listIncompleteClassifierRuns
  handlers: () => readonly ClassifierRunHandler[]
  handlerFor: (classifier: string) => ClassifierRunHandler
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
  evaluateSpendCap: evaluateOpenAiSpendCapBreach,
}

/**
 * One page of the recovery sweep, from durable state alone. A scheduled tick starts the request
 * phase of every classifier and sweeps the first page of incomplete runs; each full page chains the
 * next page under a stable job id, so a large backlog drains across jobs and overlapping sweeps
 * converge. A spend-cap breach stops the sweep before it enqueues anything.
 */
export async function processReconcileClassifierRuns(
  data: ReconcileClassifierRunsJobData,
  overrides: Partial<ReconcileClassifierRunsDependencies> = {},
): Promise<ReconcileClassifierRunsResult> {
  const dependencies = { ...defaultDependencies, ...overrides }
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
  const oldest = page.items[0]
  const oldestRequestAgeMs = oldest ? Date.now() - oldest.createdAt.getTime() : 0
  if (oldest && oldestRequestAgeMs > CLASSIFIER_RUN_AGE_ALARM_MS) {
    recordClassifierRunAlarm({
      kind: 'request-age',
      classifier: handler.slug,
      requestId: oldest.requestId,
      oldestRequestAgeMs,
      thresholdMs: CLASSIFIER_RUN_AGE_ALARM_MS,
    })
  }
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
 * retried forever, and the oldest run still in flight drives the age alarm.
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
  const settled = await giveUpExhaustedRuns(exhausted)
  const oldest = [...pending, ...settled.inFlight].reduce<IncompleteClassifierRun | undefined>(
    (current, run) => (current && current.createdAt <= run.createdAt ? current : run),
    undefined,
  )
  const oldestRunAgeMs = oldest ? Date.now() - oldest.createdAt.getTime() : 0
  if (oldest && oldestRunAgeMs > CLASSIFIER_RUN_AGE_ALARM_MS) {
    recordClassifierRunAlarm({
      kind: 'run-age',
      classifier: oldest.classifier,
      runId: oldest.runId,
      oldestRunAgeMs,
      thresholdMs: CLASSIFIER_RUN_AGE_ALARM_MS,
    })
  }
  if (page.next) {
    await enqueueReconcileClassifierRunsPage({ phase: 'incomplete', after: page.next })
  }
  return {
    kind: 'incomplete',
    enqueued: added.length,
    abandoned: settled.abandoned,
    hasNext: page.next !== null,
  }
}

async function giveUpExhaustedRuns(
  exhausted: readonly IncompleteClassifierRun[],
): Promise<{ abandoned: number; inFlight: IncompleteClassifierRun[] }> {
  const outcomes = await Promise.all(exhausted.map(giveUpSweepRun))
  return {
    abandoned: outcomes.filter(outcome => outcome === 'abandoned').length,
    inFlight: exhausted.filter((_, index) => outcomes[index] === 'in-flight'),
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
