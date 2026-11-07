import '@data-stores/valkey-core/shutdown'

import type { BatchProcessor, Job, Processor, Queue, Worker, WorkerOptions } from 'glide-mq'
import {
  createGlideMqRuntime,
  type RuntimeQueueOptions,
  type RuntimeWorkerOptions,
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
import { applySharedQueueOrdering } from './shared-queue-ordering.mts'
import {
  rejectSelfAdd,
  wrapBatchProcessor,
  wrapSingleProcessor,
} from './guarded-worker-processors.mts'

export type PriorityQueue<T> = Queue<T> & { readonly priorityKind: QueuePriorityKind }

/** Correlates a queue job's name with the payload declared by its producer package. */
export type NamedQueueJob<TPayloads extends Record<string, unknown>, TResult = unknown> = {
  [TName in keyof TPayloads & string]: Job<TPayloads[TName], TResult> & { readonly name: TName }
}[keyof TPayloads & string]

const priorityKinds = new Map<string, QueuePriorityKind>()
const orderingConcurrency = new Map<string, (key: string) => number>()

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
    const checked = checkedPriorityOptions(queueName, priorityKinds.get(queueName)!, opts)
    const getConcurrency = orderingConcurrency.get(queueName)
    return {
      opts: getConcurrency ? applySharedQueueOrdering(jobName, checked, getConcurrency) : checked,
    }
  },
})

export function createQueue<T = unknown>(
  name: string,
  options: RuntimeQueueOptions & {
    priorityKind: QueuePriorityKind
    orderingConcurrency?: (key: string) => number
  },
): PriorityQueue<T> {
  const { priorityKind, orderingConcurrency: getConcurrency, ...queueOptions } = options
  priorityKinds.set(name, priorityKind)
  if (getConcurrency) orderingConcurrency.set(name, getConcurrency)
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

export function createWorker<
  TData = unknown,
  TResult = unknown,
  TJob extends Job<TData, TResult> = Job<TData, TResult>,
>(
  name: string,
  processor: (job: TJob) => Promise<TResult>,
  options?: RuntimeWorkerOptions,
): Worker<TJob['data'], TResult> {
  // GlideMQ deserializes a string name and payload independently. Queue processors retain the
  // runtime unknown-name rejection; this is the one boundary where their correlated type enters.
  return runtime.createWorker<TJob['data'], TResult>(
    name,
    processor as Processor<TJob['data'], TResult>,
    options,
  )
}

/** A worker whose processor receives up to `batch.size` jobs at once instead of one. */
export function createBatchWorker<
  TData = unknown,
  TResult = unknown,
  TJob extends Job<TData, TResult> = Job<TData, TResult>,
>(
  name: string,
  processor: (jobs: TJob[]) => Promise<TResult[]>,
  options: RuntimeWorkerOptions & Required<Pick<WorkerOptions, 'batch'>>,
): Worker<TJob['data'], TResult> {
  return runtime.createBatchWorker<TJob['data'], TResult>(
    name,
    processor as BatchProcessor<TJob['data'], TResult>,
    options,
  )
}

export const closeAndUnregisterGlideMQInstance = runtime.close
