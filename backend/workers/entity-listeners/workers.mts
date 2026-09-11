import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import * as listeners from './processors/index.mts'
import processEntityListener from './processors.mts'
import type { EntityJobs } from '@queues/entity-listeners/types'
import { QUEUE_NAME } from '@queues/entity-listeners/config'
import type { Job } from 'glide-mq'

export const entitiesListeners = createWorker(
  QUEUE_NAME,
  async (job: Job) => {
    return await processEntityListener(listeners, job.name as EntityJobs, job.data)
  },
  {
    concurrency: getWorkerConcurrency('entitiesListeners', { baseline: 5 }),
  },
)
