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

/**
 * A job's `stalledCount` never resets, so the (maxStalledCount + 1)th stall fails it permanently
 * regardless of `attempts`. glide-mq's default of 1 lets one rolling deploy plus one slow
 * heartbeat fail a job; 2 survives that without hiding a job that keeps stalling.
 */
const DEFAULT_MAX_STALLED_COUNT = 2

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

export function createQueue<T = unknown>(name: string, options: SharedQueueOptions = {}): Queue<T> {
  const queue = new Queue<T>(name, {
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
    client: workerQueueCommandClient,
    ...options,
  })
  registerGlideMQInstance(queue)
  return queue
}
export function createWorker<D = unknown, R = unknown>(
  name: string,
  processor: Processor<D, R>,
  options: SharedWorkerOptions = {},
): Worker<D, R> {
  return buildWorker<D, R>(name, processor, options)
}
/** A worker whose processor receives up to `batch.size` jobs at once instead of one. */
export function createBatchWorker<D = unknown, R = unknown>(
  name: string,
  processor: BatchProcessor<D, R>,
  { batch, ...options }: SharedWorkerOptions & Required<Pick<WorkerOptions, 'batch'>>,
): Worker<D, R> {
  return buildWorker<D, R>(name, processor, { ...options, batch })
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
  const worker = new Worker<D, R>(name, processor, {
    connection: workerQueueConnection,
    ...options,
    prefix: options.prefix ?? workerQueuePrefix,
    maxStalledCount: options.maxStalledCount ?? DEFAULT_MAX_STALLED_COUNT,
    commandClient: dedicated?.client ?? workerQueueCommandClient,
  })
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
