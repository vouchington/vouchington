import {
  ENQUEUE_BASE_DEFAULTS as SHARED_ENQUEUE_BASE_DEFAULTS,
  createBulkEnqueueFunction as createSharedBulkEnqueueFunction,
  createEnqueueFunction as createSharedEnqueueFunction,
} from '@vouchington/worker-runtime/glide-mq'
import {
  checkpointPagedDispatchFences,
  pagedDispatchRowOptions,
} from './paged-dispatch-context.mts'
import { enqueueBulkRows } from './glide-mq-paged-bulk-recovery.mts'
import onError from '@modules/on-error'
import { trackJobEnqueue } from '@data-stores/analytics/queue'
import type { JobOptions } from 'glide-mq'
import { retryTransientEnqueue } from './glide-mq-retry.mts'
import { assertQueuePriority, type QueuePriorityKind } from './queue-priority.mts'
import type {
  CreateBulkEnqueueFunction,
  CreateBulkEnqueueFunctionOptions,
  CreateEnqueueFunction,
  CreateEnqueueFunctionOptions,
  ErrorWithReportingContext,
} from './glide-mq-enqueue-types.mts'

export const ENQUEUE_BASE_DEFAULTS = {
  ...SHARED_ENQUEUE_BASE_DEFAULTS,
  priority: 10,
} satisfies JobOptions

// A queue's priority contract: ranked queues default to 10 and accept 1..2048, unranked queues
// accept only 0.
function withQueuePriority(
  queueName: string,
  kind: QueuePriorityKind,
  options: JobOptions,
): JobOptions {
  const priority = options.priority ?? (kind === 'none' ? 0 : 10)
  assertQueuePriority(queueName, kind, priority)
  return { ...options, priority }
}

const createEnqueueFunctionImpl = <TData, TName extends string, TCallContext = unknown>(
  options: CreateEnqueueFunctionOptions<TName, TCallContext>,
) =>
  createSharedEnqueueFunction<TData, TName, TCallContext>({
    ...options,
    retryFn: fn => retryTransientEnqueue(fn),
    normalizeOptions: opts =>
      withQueuePriority(options.queueName, options.queue.priorityKind, opts),
    onEnqueue: options.trackJobEnqueue ?? trackJobEnqueue,
    reportError: onError,
  })

export const createEnqueueFunction = createEnqueueFunctionImpl as CreateEnqueueFunction

/** Waits for queue admission without reporting a factory-owned rejection a second time. */
export async function awaitReportedEnqueueAdmission(start: () => Promise<unknown>): Promise<void> {
  let admission: Promise<unknown>
  try {
    admission = start()
  } catch (err) {
    onError(toErrorWithReportingContext(err))
    return
  }
  try {
    await admission
  } catch {
    // createEnqueueFunction already reported this rejected admission promise.
  }
}

const createBulkEnqueueFunctionImpl = <TInput, TData, TName extends string, TCallContext = unknown>(
  options: CreateBulkEnqueueFunctionOptions<TInput, TData, TName, TCallContext>,
) =>
  createSharedBulkEnqueueFunction<TInput, TData, TName, TCallContext>({
    ...options,
    retryFn: fn => retryTransientEnqueue(fn),
    normalizeOptions: (opts, job) =>
      pagedDispatchRowOptions(
        options.queueName,
        job.jobName,
        job.data,
        withQueuePriority(options.queueName, options.queue.priorityKind, opts),
      ),
    // Inside a paged dispatch, fences are checkpointed first and finished rows are recovered.
    addBulk: jobs => {
      const add = () =>
        enqueueBulkRows(options.queue, options.queueName, jobs, {
          prefix: options.queuePrefix,
          retry: options.retry,
          reactivatedData: options.reactivatedData,
        })
      const checkpoint = checkpointPagedDispatchFences()
      return checkpoint ? checkpoint.then(add) : add()
    },
    onEnqueue: options.trackJobEnqueue ?? trackJobEnqueue,
    reportError: onError,
  })

export const createBulkEnqueueFunction = createBulkEnqueueFunctionImpl as CreateBulkEnqueueFunction

function toErrorWithReportingContext(error: unknown): ErrorWithReportingContext {
  return error instanceof Error ? error : new Error(String(error), { cause: error })
}
