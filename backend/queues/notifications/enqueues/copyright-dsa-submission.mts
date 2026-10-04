import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import { PRIORITY_DEFAULT, QUEUE_NAME } from '../config.mts'
import { notifications } from '../queues.mts'

const FIVE_MINUTES_MS = 5 * 60 * 1000
const enqueueSubmit = createEnqueueFunction<
  { submissionId: string },
  'processSubmitDsaStatementOfReasons'
>({ queue: notifications, queueName: QUEUE_NAME, jobName: 'processSubmitDsaStatementOfReasons' })
const enqueueReconcile = createEnqueueFunction<
  Record<string, never>,
  'processReconcileDsaStatementSubmissions'
>({
  queue: notifications,
  queueName: QUEUE_NAME,
  jobName: 'processReconcileDsaStatementSubmissions',
})

/** The durable item lease and ledger fence duplicate jobs; replay must enqueue immediately. */
export function enqueueSubmitDsaStatementOfReasons(submissionId: string): EnqueueReturnType {
  return enqueueSubmit(
    { submissionId },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
      removeOnComplete: 100,
      removeOnFail: 100,
      priority: PRIORITY_DEFAULT,
    },
  )
}

export function enqueueReconcileDsaStatementSubmissions(): EnqueueReturnType {
  return enqueueReconcile(
    {},
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
      removeOnComplete: 100,
      removeOnFail: 100,
      priority: PRIORITY_DEFAULT,
      deduplication: {
        id: 'copyright-dsa-statement-reconciliation',
        mode: 'throttle',
        ttl: FIVE_MINUTES_MS,
      },
    },
  )
}
