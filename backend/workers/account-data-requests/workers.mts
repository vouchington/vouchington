import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import {
  ACCOUNT_DATA_REQUESTS_QUEUE_NAME,
  ACCOUNT_DATA_REQUESTS_LOCK_DURATION_MS,
} from '@queues/account-data-requests/config'
import { processAccountDataRequestJob } from './processors/process-job.mts'

export const accountDataRequests = createWorker(
  ACCOUNT_DATA_REQUESTS_QUEUE_NAME,
  processAccountDataRequestJob,
  {
    concurrency: getWorkerConcurrency('accountDataRequests', { baseline: 2, ignoreScale: true }),
    lockDuration: ACCOUNT_DATA_REQUESTS_LOCK_DURATION_MS,
    stalledInterval: 30_000,
  },
)
