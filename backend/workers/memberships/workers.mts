import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { deferPostgresConnectionTimeout } from '@modules/queue-errors'
import { QUEUE_NAME } from '@queues/memberships/config'
import { processMembershipJob } from './processors/process-job.mts'

export const memberships = createWorker(
  QUEUE_NAME,
  job => deferPostgresConnectionTimeout(job, () => processMembershipJob(job)),
  { concurrency: getWorkerConcurrency('memberships', { baseline: 5 }) },
)
