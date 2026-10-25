import { createQueueClassResolver } from '@vouchington/worker-runtime'
import { allWorkerQueueNames, workerQueuePolicy } from './worker-queue-policy.mts'

/**
 * Deployment classes infrastructure can ask a worker process to run: `all` is the merged
 * profile, `cpu` the CPU-only queues, and `io` the I/O-capable queues. SQS consumers and
 * explicit-inclusion queues are listed by name because an unset queue selection would skip the
 * latter.
 */
const WORKER_QUEUE_CLASS_QUEUES = {
  all: allWorkerQueueNames(),
  cpu: [...workerQueuePolicy.cpuOnlyQueues],
  io: [...workerQueuePolicy.ioCapableQueues],
} as const

export type WorkerQueueClass = keyof typeof WORKER_QUEUE_CLASS_QUEUES

export const resolveQueueSelection = createQueueClassResolver(WORKER_QUEUE_CLASS_QUEUES)
