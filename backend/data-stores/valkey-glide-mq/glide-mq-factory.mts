import '@data-stores/valkey-core/shutdown'

import type { Queue } from 'glide-mq'
import {
  createGlideMqRuntime,
  type RuntimeQueueOptions,
} from '@vouchington/worker-runtime/glide-mq'
import onError from '@modules/on-error'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import {
  registerGlideMQInstance,
  unregisterGlideMQInstance,
} from '@data-stores/valkey-core/glide-mq-registry'
import { workerQueueCommandClient } from './glide-mq-shared-client.mts'
import { createRetryingCommandClient } from './glide-mq-command-client.mts'
import { checkedPriorityOptions, type QueuePriorityKind } from './queue-priority.mts'
import { DEFAULT_MAX_STALLED_COUNT } from './worker-stall-budget.mts'
import {
  rejectSelfAdd,
  wrapBatchProcessor,
  wrapSingleProcessor,
} from './guarded-worker-processors.mts'

export type PriorityQueue<T> = Queue<T> & { readonly priorityKind: QueuePriorityKind }

const priorityKinds = new Map<string, QueuePriorityKind>()

const runtime = createGlideMqRuntime({
  connection: workerQueueConnection,
  prefix: workerQueuePrefix,
  commandClient: workerQueueCommandClient,
  createDedicatedCommandClient: () => createRetryingCommandClient('worker-queue-dedicated'),
  register: instance => registerGlideMQInstance(instance as { close(): Promise<void> }),
  unregister: instance => unregisterGlideMQInstance(instance as { close(): Promise<void> }),
  onError,
  defaultMaxStalledCount: DEFAULT_MAX_STALLED_COUNT,
  wrapProcessor: (processor, queueName, workerOptions) =>
    wrapSingleProcessor(queueName, processor, workerOptions),
  wrapBatchProcessor: (processor, queueName, workerOptions) =>
    wrapBatchProcessor(queueName, processor, workerOptions),
  // Every queue add, bulk add and scheduler upsert keeps its queue's priority contract and
  // refuses to let a processor add the job it is running.
  guardAdd: ({ queueName, jobName, opts }) => {
    if (rejectSelfAdd(queueName, jobName, opts)) return 'skip'
    return { opts: checkedPriorityOptions(queueName, priorityKinds.get(queueName)!, opts) }
  },
})

export function createQueue<T = unknown>(
  name: string,
  options: RuntimeQueueOptions & { priorityKind: QueuePriorityKind },
): PriorityQueue<T> {
  const { priorityKind, ...queueOptions } = options
  priorityKinds.set(name, priorityKind)
  return Object.assign(runtime.createQueue<T>(name, queueOptions), { priorityKind })
}

/**
 * A handle for queue maintenance (obliterate, scheduler removal) that never adds jobs, so it
 * carries no priority contract. Use it instead of `createQueue` when the caller does not own the
 * queue's `priorityKind`: where queues are shared by name (the in-memory test adapter), `createQueue`
 * re-wraps the shared instance and overwrites its `priorityKind`, which breaks every later enqueue
 * on a queue of the other kind.
 */
export const createMaintenanceQueue = runtime.createMaintenanceQueue

export const createWorker = runtime.createWorker

/** A worker whose processor receives up to `batch.size` jobs at once instead of one. */
export const createBatchWorker = runtime.createBatchWorker

export const closeAndUnregisterGlideMQInstance = runtime.close
