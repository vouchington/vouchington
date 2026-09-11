import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import type { PsqlJobs, RefreshMaterializedViewData } from '@queues/psql/types'
import { QUEUE_NAME } from '@queues/psql/config'
import processPsql from './processors.mts'
import { Worker, type Job } from 'glide-mq'

export const psql = new Worker(
  QUEUE_NAME,
  (job: Job) => {
    return processPsql(job.name as PsqlJobs, job.data as Partial<RefreshMaterializedViewData>)
  },
  {
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
    concurrency: getWorkerConcurrency('psql', { baseline: 1, ignoreScale: true }),
  },
)
