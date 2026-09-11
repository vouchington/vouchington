import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { Worker, type Job } from 'glide-mq'
import { CUSTOMER_SUPPORT_QUEUE_NAME } from '@queues/customer-support/config'
import {
  processCustomerSupportJob as processor,
  type CustomerSupportJobData,
} from '../processors/process-job.mts'

export const customer_support = new Worker(
  CUSTOMER_SUPPORT_QUEUE_NAME,
  (job: Job<CustomerSupportJobData>): Promise<unknown> => processor(job, customer_support),
  {
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
    concurrency: getWorkerConcurrency('customerSupport', { baseline: 5 }),
  },
)
