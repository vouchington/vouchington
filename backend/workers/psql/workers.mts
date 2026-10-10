import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import type { PsqlJobs, RefreshMaterializedViewData } from '@queues/psql/types'
import { QUEUE_NAME } from '@queues/psql/config'
import processPsql from './processors.mts'
import type { Job } from 'glide-mq'

export const psql = createWorker(
  QUEUE_NAME,
  (job: Job) => {
    return processPsql(job.name as PsqlJobs, job.data as Partial<RefreshMaterializedViewData>)
  },
  {
    dedicatedCommandClient: true,
    concurrency: getWorkerConcurrency('psql', { baseline: 1, ignoreScale: true }),
  },
)
