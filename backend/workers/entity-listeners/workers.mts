import { processReconciliationJob } from './processors/process-reconciliation-job.mts'
import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import * as listeners from './processors/index.mts'
import processEntityListener from './processors.mts'
import { parseEntityJob } from '@queues/entity-listeners/payload/job-payload'
import { QUEUE_NAME } from '@queues/entity-listeners/config'
import type { Job } from 'glide-mq'

export async function dispatchEntityListenerJob(job: Job): Promise<unknown> {
  if (job.name === 'reconcileEntities') return processReconciliationJob(job)
  const parsed = parseEntityJob(job.name, job.data)
  return processEntityListener(listeners, parsed.name, parsed.data)
}

export const entitiesListeners = createWorker(
  QUEUE_NAME,
  (job: Job) => dispatchEntityListenerJob(job),
  {
    concurrency: getWorkerConcurrency('entitiesListeners', { baseline: 5 }),
  },
)
