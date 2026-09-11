import { Worker, type Job } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { processImportRow } from './processors.mts'
import { ADMIN_IMPORTS_DEFAULTS, QUEUE_NAME } from '@queues/admin-imports/config'
import type { AdminImportJobs } from '@queues/admin-imports/types'

export const adminImports = new Worker(
  QUEUE_NAME,
  (job: Job) => {
    switch (job.name as AdminImportJobs) {
      case 'processImportRow': {
        const data = job.data as { batchId?: string; rowId?: string } | null
        if (!data?.batchId) throw new Error('Admin import job .batchId is required')
        if (!data?.rowId) throw new Error('Admin import job .rowId is required')
        const maxAttempts = ADMIN_IMPORTS_DEFAULTS.attempts ?? 3
        const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts
        return processImportRow(data.batchId, data.rowId, { isFinalAttempt })
      }
      default:
        throw new Error(`Unknown admin import job: ${job.name}`)
    }
  },
  {
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
    concurrency: getWorkerConcurrency('adminImports', { baseline: 5 }),
  },
)
