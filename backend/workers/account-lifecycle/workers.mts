import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { LOCK_DURATION_MS, QUEUE_NAME } from '@queues/account-lifecycle/config'
import { processAccountLifecycleJob } from './processors.mts'

export const accountLifecycle = createWorker(QUEUE_NAME, processAccountLifecycleJob, {
  concurrency: getWorkerConcurrency('accountLifecycle', { baseline: 2, ignoreScale: true }),
  lockDuration: LOCK_DURATION_MS,
  stalledInterval: 30_000,
})
