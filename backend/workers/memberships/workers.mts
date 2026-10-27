import { pagedDispatchBackoffStrategies } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { QUEUE_NAME } from '@queues/memberships/config'
import { processMembershipJob } from './processors/process-job.mts'

export const memberships = createWorker(QUEUE_NAME, processMembershipJob, {
  backoffStrategies: pagedDispatchBackoffStrategies(),
  concurrency: getWorkerConcurrency('memberships', { baseline: 5 }),
})
