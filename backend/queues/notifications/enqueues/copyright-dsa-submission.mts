import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  NOTIFICATIONS_RECONCILE_DSA_JOB,
  NOTIFICATIONS_SUBMIT_DSA_JOB,
} from '@queues/background/enqueues/notifications-jobs'
import type { EnqueueReturnType } from '@voucha/types'

const FIVE_MINUTES_MS = 5 * 60 * 1000
const enqueueSubmit = createBackgroundEnqueue(NOTIFICATIONS_SUBMIT_DSA_JOB)
export const enqueueBulkSubmitDsaStatementOfReasons = createBackgroundBulkEnqueue(
  NOTIFICATIONS_SUBMIT_DSA_JOB,
  (submissionId: string) => ({ data: { submissionId } }),
)
const enqueueReconcile = createBackgroundEnqueue(NOTIFICATIONS_RECONCILE_DSA_JOB)

/** The durable item lease and ledger fence duplicate jobs; replay must enqueue immediately. */
export function enqueueSubmitDsaStatementOfReasons(submissionId: string): EnqueueReturnType {
  return enqueueSubmit({ submissionId })
}

export function enqueueReconcileDsaStatementSubmissions(): EnqueueReturnType {
  return enqueueReconcile(
    {},
    {
      deduplication: {
        id: 'copyright-dsa-statement-reconciliation',
        mode: 'throttle',
        ttl: FIVE_MINUTES_MS,
      },
    },
  )
}
