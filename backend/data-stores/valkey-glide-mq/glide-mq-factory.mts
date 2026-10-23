import '@data-stores/valkey-core/shutdown'

import {
  FlowProducer,
  Queue,
  Worker,
  type BatchProcessor,
  type Processor,
  type QueueOptions,
  type WorkerOptions,
} from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { workerQueueCommandClient } from './glide-mq-shared-client.mts'
import {
  createRetryingCommandClient,
  type RetryingCommandClient,
} from './glide-mq-command-client.mts'
import {
  registerGlideMQInstance,
  unregisterGlideMQInstance,
} from '@data-stores/valkey-core/glide-mq-registry'
import { checkedPriorityOptions, type QueuePriorityKind } from './queue-priority.mts'
import { DEFAULT_MAX_STALLED_COUNT } from './worker-stall-budget.mts'
import {
  rejectSelfAdd,
  wrapBatchProcessor,
  wrapSingleProcessor,
} from './guarded-worker-processors.mts'

type SharedQueueOptions = Pick<QueueOptions, 'deadLetterQueue' | 'compression' | 'serializer'>
type SharedWorkerOptions = Omit<WorkerOptions, 'connection' | 'commandClient' | 'client'> & {
  /**
   * Give this worker its own command connection instead of the process-wide shared one, so its
   * heartbeats and completions never queue behind other queues' promote, stalled-scan, and
   * addBulk traffic. The connection keeps the shared client's request timeout, inflight limit, and
   * saturation retry, and closes when the worker closes.
   */
  dedicatedCommandClient?: boolean
}
const sharedQueueConnection = {
  connection: workerQueueConnection,
  prefix: workerQueuePrefix,
  client: workerQueueCommandClient,
}
export type PriorityQueue<T> = Queue<T> & { readonly priorityKind: QueuePriorityKind }

export function createQueue<T = unknown>(
  name: string,
  options: SharedQueueOptions & { priorityKind: QueuePriorityKind },
): PriorityQueue<T> {
  const { priorityKind, ...queueOptions } = options
  const queue = new Queue<T>(name, { ...sharedQueueConnection, ...queueOptions })
  const originalAdd = queue.add
  const originalAddBulk = queue.addBulk
  // ast-grep-ignore: backend-no-direct-scheduler-upsert -- intercept the queue's scheduler API to enforce priority before the manifest runtime calls it
  const originalUpsertJobScheduler = queue.upsertJobScheduler
  queue.add = (jobName, data, opts) => {
    if (rejectSelfAdd(name, jobName, opts)) return Promise.resolve(null)
    return originalAdd.call(queue, jobName, data, checkedPriorityOptions(name, priorityKind, opts))
  }
  queue.addBulk = jobs => {
    const allowed = jobs.filter(job => !rejectSelfAdd(name, job.name, job.opts))
    if (allowed.length === 0) return Promise.resolve([])
    return originalAddBulk.call(
      queue,
      allowed.map(job => ({
        ...job,
        opts: checkedPriorityOptions(name, priorityKind, job.opts),
      })),
    )
  }
  // ast-grep-ignore: backend-no-direct-scheduler-upsert -- this guard wraps, rather than creates, scheduled jobs
  queue.upsertJobScheduler = (schedulerName, schedule, template) =>
    originalUpsertJobScheduler.call(queue, schedulerName, schedule, {
      ...template,
      opts: checkedPriorityOptions(name, priorityKind, template?.opts),
    })
  const priorityQueue = Object.assign(queue, { priorityKind })
  registerGlideMQInstance(priorityQueue)
  return priorityQueue
}

/**
 * A handle for queue maintenance (obliterate, scheduler removal) that never adds jobs, so it
 * carries no priority contract. Use it instead of `createQueue` when the caller does not own the
 * queue's `priorityKind`: where queues are shared by name (the in-memory test adapter), `createQueue`
 * re-wraps the shared instance and overwrites its `priorityKind`, which breaks every later enqueue
 * on a queue of the other kind.
 */
export function createMaintenanceQueue<T = unknown>(name: string): Queue<T> {
  const queue = new Queue<T>(name, sharedQueueConnection)
  registerGlideMQInstance(queue)
  return queue
}

export function createWorker<D = unknown, R = unknown>(
  name: string,
  processor: Processor<D, R>,
  options: SharedWorkerOptions = {},
): Worker<D, R> {
  return buildWorker<D, R>(name, wrapSingleProcessor(name, processor, options), options)
}
/** A worker whose processor receives up to `batch.size` jobs at once instead of one. */
export function createBatchWorker<D = unknown, R = unknown>(
  name: string,
  processor: BatchProcessor<D, R>,
  { batch, ...options }: SharedWorkerOptions & Required<Pick<WorkerOptions, 'batch'>>,
): Worker<D, R> {
  const wrapped = wrapBatchProcessor(name, processor, options)
  return buildWorker<D, R>(name, wrapped, { ...options, batch })
}
/** @public Documented GlideMQ factory contract. */
export function createFlowProducer(): FlowProducer {
  const fp = new FlowProducer({
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
    client: workerQueueCommandClient,
  })
  registerGlideMQInstance(fp)
  return fp
}

export async function closeAndUnregisterGlideMQInstance(instance: {
  close(): Promise<void>
}): Promise<void> {
  await instance.close()
  unregisterGlideMQInstance(instance)
}

function buildWorker<D, R>(
  name: string,
  processor: Processor<D, R> | BatchProcessor<D, R>,
  { dedicatedCommandClient = false, ...options }: SharedWorkerOptions,
): Worker<D, R> {
  const dedicated = dedicatedCommandClient
    ? createRetryingCommandClient('worker-queue-dedicated')
    : undefined
  const workerOptions = {
    connection: workerQueueConnection,
    ...options,
    prefix: options.prefix ?? workerQueuePrefix,
    maxStalledCount: options.maxStalledCount ?? DEFAULT_MAX_STALLED_COUNT,
    commandClient: dedicated?.client ?? workerQueueCommandClient,
  }
  const worker = new Worker<D, R>(name, processor, workerOptions)
  if (dedicated) closeCommandClientWithWorker(worker, dedicated)
  registerGlideMQInstance(worker)
  return worker
}

// glide-mq closes only a command client it created, so a worker handed a dedicated client must
// release it itself. Wrapping close() covers every closer: graceful shutdown through the registry,
// direct worker.close() calls, and glide-mq's own internal close.
function closeCommandClientWithWorker(
  worker: { close(force?: boolean): Promise<void> },
  dedicated: RetryingCommandClient,
) {
  const closeWorker = worker.close
  worker.close = async function closeWorkerAndCommandClient(force?: boolean): Promise<void> {
    try {
      await closeWorker.call(worker, force)
    } finally {
      await dedicated.close()
    }
  }
}
