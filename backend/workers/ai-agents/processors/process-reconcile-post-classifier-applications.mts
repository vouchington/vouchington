import { recordPostClassifierReceiptAlarm } from '@modules/on-error'
import {
  POST_CLASSIFIER_SWEEP_ENQUEUE_BOUND,
  abandonPostClassifierSweepReceipt,
  recordPostClassifierSweepEnqueues,
  streamIncompletePostClassifierApplicationBatches,
  type IncompletePostClassifierApplication,
} from '@services/post-classifier'
import {
  enqueueBulkPostClassifiers,
  postClassifierJobExists,
} from '@queues/ai-agents/enqueues/post-classifier'
import type { PostClassifierJobData } from '@queues/ai-agents/types'

/**
 * Longer than any legitimate delay: the spend cap parks a job until day end, so a healthy receipt
 * can wait most of a day. C12 (#225) owns receipt-health alarms and this threshold going forward.
 */
export const POST_CLASSIFIER_RECEIPT_AGE_ALARM_MS = 26 * 60 * 60 * 1000

export interface ReconcilePostClassifierApplicationsDependencies {
  /** Lets a test scope the sweep to its own receipts in a database shared with parallel tests. */
  streamBatches: typeof streamIncompletePostClassifierApplicationBatches
}

/**
 * Re-enqueues every recoverable receipt whose job is gone. Each enqueue that actually adds a job
 * is counted; a receipt whose last permitted job has disappeared is given up with an alarm rather
 * than retried forever, and the oldest receipt still in flight drives the age alarm.
 */
export async function processReconcilePostClassifierApplications(
  dependencies: Partial<ReconcilePostClassifierApplicationsDependencies> = {},
): Promise<{ enqueued: number; abandoned: number }> {
  const streamBatches =
    dependencies.streamBatches ?? streamIncompletePostClassifierApplicationBatches
  let enqueued = 0
  let abandoned = 0
  let oldest: IncompletePostClassifierApplication | undefined
  for await (const applications of streamBatches()) {
    const exhausted = applications.filter(
      application => application.sweepEnqueueCount >= POST_CLASSIFIER_SWEEP_ENQUEUE_BOUND,
    )
    const pending = applications.filter(application => !exhausted.includes(application))
    const addedIds = new Set(await enqueueBulkPostClassifiers(pending.map(toJobData)))
    const added = pending.filter(application => addedIds.has(application.applicationId))
    await recordPostClassifierSweepEnqueues(added)
    enqueued += added.length
    for (const application of pending) oldest = older(oldest, application)
    const settled = await giveUpExhaustedReceipts(exhausted)
    abandoned += settled.abandoned
    for (const application of settled.inFlight) oldest = older(oldest, application)
  }
  if (oldest) {
    const oldestReceiptAgeMs = Date.now() - oldest.createdAt.getTime()
    if (oldestReceiptAgeMs > POST_CLASSIFIER_RECEIPT_AGE_ALARM_MS) {
      recordPostClassifierReceiptAlarm({
        kind: 'receipt-age',
        postId: oldest.postId,
        applicationId: oldest.applicationId,
        oldestReceiptAgeMs,
        thresholdMs: POST_CLASSIFIER_RECEIPT_AGE_ALARM_MS,
      })
    }
  }
  return { enqueued, abandoned }
}

async function giveUpExhaustedReceipts(
  exhausted: IncompletePostClassifierApplication[],
): Promise<{ abandoned: number; inFlight: IncompletePostClassifierApplication[] }> {
  const outcomes = await Promise.all(exhausted.map(giveUpSweepReceipt))
  return {
    abandoned: outcomes.filter(outcome => outcome === 'abandoned').length,
    inFlight: exhausted.filter((_, index) => outcomes[index] === 'in-flight'),
  }
}

/** Gives up a receipt at the bound once its last job is gone, and leaves it be while that job lives. */
async function giveUpSweepReceipt(
  application: IncompletePostClassifierApplication,
): Promise<'abandoned' | 'in-flight' | 'settled'> {
  if (await postClassifierJobExists(application.applicationId)) return 'in-flight'
  const outcome = await abandonPostClassifierSweepReceipt(application)
  if (outcome === 'skipped') return 'settled'
  recordPostClassifierReceiptAlarm({
    kind: 'sweep-bound-exceeded',
    postId: application.postId,
    applicationId: application.applicationId,
    sweepEnqueueCount: application.sweepEnqueueCount,
    terminal: outcome === 'terminal',
  })
  return 'abandoned'
}

function older(
  current: IncompletePostClassifierApplication | undefined,
  candidate: IncompletePostClassifierApplication,
): IncompletePostClassifierApplication {
  return current && current.createdAt <= candidate.createdAt ? current : candidate
}

function toJobData(application: IncompletePostClassifierApplication): PostClassifierJobData {
  return {
    applicationId: application.applicationId,
    postId: application.postId,
    inputSha256: application.inputSha256,
    configurationSha256: application.configurationSha256,
    detectorPackageVersion: application.detectorPackageVersion,
  }
}
