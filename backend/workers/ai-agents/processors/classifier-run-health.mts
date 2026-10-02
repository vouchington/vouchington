import onError, { recordClassifierRunAlarm } from '@modules/on-error'
import {
  CLASSIFIER_REQUEST_AGE_ALARM_MS,
  CLASSIFIER_RUN_AGE_ALARM_MS,
  CLASSIFIER_TERMINAL_FAILURE_ALARM_COUNT,
  CLASSIFIER_TERMINAL_WINDOW_MS,
  CLASSIFIER_UNREQUESTED_GRACE_MS,
  type ClassifierRunHealth,
} from '@services/classifier-runs'
import type { ClassifierRunHandler } from './classifier-run-handler.mts'

export type ReadClassifierRunHealth = (
  handler: ClassifierRunHandler,
  now: Date,
) => Promise<ClassifierRunHealth>

/** Raises an alarm for each threshold one classifier's receipt health has crossed. */
function alarmClassifierRunHealth(health: ClassifierRunHealth): void {
  const { classifier, oldestIncompleteRun, oldestPendingRequest, unrequestedFeedItems } = health
  if (oldestIncompleteRun && oldestIncompleteRun.ageMs > CLASSIFIER_RUN_AGE_ALARM_MS) {
    recordClassifierRunAlarm({
      kind: 'run-age',
      classifier,
      runId: oldestIncompleteRun.id,
      oldestRunAgeMs: oldestIncompleteRun.ageMs,
      thresholdMs: CLASSIFIER_RUN_AGE_ALARM_MS,
      incompleteRuns: oldestIncompleteRun.total,
    })
  }
  if (oldestPendingRequest && oldestPendingRequest.ageMs > CLASSIFIER_REQUEST_AGE_ALARM_MS) {
    recordClassifierRunAlarm({
      kind: 'request-age',
      classifier,
      requestId: oldestPendingRequest.id,
      oldestRequestAgeMs: oldestPendingRequest.ageMs,
      thresholdMs: CLASSIFIER_REQUEST_AGE_ALARM_MS,
      pendingRequests: oldestPendingRequest.total,
    })
  }
  if (unrequestedFeedItems && unrequestedFeedItems.total > 0) {
    recordClassifierRunAlarm({
      kind: 'subject-unrequested',
      classifier,
      unrequestedSubjects: unrequestedFeedItems.total,
      oldestUnrequestedAgeMs: unrequestedFeedItems.oldestAgeMs,
      graceMs: CLASSIFIER_UNREQUESTED_GRACE_MS,
    })
  }
  if (health.terminal.failedTotal >= CLASSIFIER_TERMINAL_FAILURE_ALARM_COUNT) {
    recordClassifierRunAlarm({
      kind: 'terminal-failures',
      classifier,
      windowMs: CLASSIFIER_TERMINAL_WINDOW_MS,
      thresholdCount: CLASSIFIER_TERMINAL_FAILURE_ALARM_COUNT,
      failedTotal: health.terminal.failedTotal,
      failedByKind: health.terminal.failed,
      completed: health.terminal.completed,
    })
  }
}

/**
 * Reads every classifier's receipt health and alarms on what crossed a threshold. One classifier's
 * failed read is reported and never stops the others, nor the recovery sweep that runs after it.
 */
export async function checkClassifierRunHealth(
  handlers: readonly ClassifierRunHandler[],
  now: Date,
  readHealth: ReadClassifierRunHealth = (handler, at) => handler.health(at),
): Promise<void> {
  const outcomes = await Promise.allSettled(handlers.map(handler => readHealth(handler, now)))
  for (const outcome of outcomes) {
    if (outcome.status === 'fulfilled') alarmClassifierRunHealth(outcome.value)
    else
      onError(outcome.reason instanceof Error ? outcome.reason : new Error(String(outcome.reason)))
  }
}
