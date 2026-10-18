import {
  checkpointPagedDispatchFences,
  pagedDispatchRowOptions,
} from './paged-dispatch-context.mts'
import { enqueueBulkRows } from './glide-mq-paged-bulk-recovery.mts'
import onError from '@modules/on-error'
import { publishEnqueueAdmission } from './glide-mq-admission.mts'
import { trackJobEnqueue } from '@data-stores/analytics/queue'
import type { JobOptions, Queue } from 'glide-mq'
import { retryTransientEnqueue } from './glide-mq-retry.mts'
import { assertQueuePriority, type QueuePriorityKind } from './queue-priority.mts'

type AddQueue = Pick<Queue, 'add'> & { readonly priorityKind: QueuePriorityKind }
type AddBulkQueue = Pick<Queue, 'addBulk'> & {
  readonly priorityKind: QueuePriorityKind
  readonly name?: string
}

type ErrorWithReportingContext = Error & {
  extra?: Record<string, unknown> | null
  tags?: Record<string, string | number | boolean> | null
}

type EnqueueErrorContext<TCallContext = unknown> = {
  queueName: string
  jobName: string
  count: number
  callContext?: TCallContext
}

type CreateEnqueueFunctionOptions<TName extends string, TCallContext = unknown> = {
  queue: AddQueue
  queueName: string
  jobName: TName
  defaults?: Partial<JobOptions>
  decorateError?: (
    error: ErrorWithReportingContext,
    context: EnqueueErrorContext<TCallContext>,
  ) => Error
  retry?: boolean
  trackJobEnqueue?: typeof trackJobEnqueue
}

type CreateBulkEnqueueFunctionOptions<
  TInput,
  TData,
  TName extends string,
  TCallContext = unknown,
> = {
  queue: AddBulkQueue
  queueName: string
  jobName: TName
  defaults?: Partial<JobOptions>
  buildJob: (
    input: TInput,
    index: number,
  ) => {
    data: TData
    opts?: Partial<JobOptions>
  }
  decorateError?: (
    error: ErrorWithReportingContext,
    context: EnqueueErrorContext<TCallContext>,
  ) => Error
  retry?: boolean
  /** Isolated real queues in tests may override the production queue namespace. */
  queuePrefix?: string
  trackJobEnqueue?: typeof trackJobEnqueue
}

export const ENQUEUE_BASE_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
  priority: 10,
} satisfies JobOptions

export function createEnqueueFunction<TData, TName extends string, TCallContext = unknown>(
  options: CreateEnqueueFunctionOptions<TName, TCallContext>,
) {
  return (
    data: TData,
    perCallOpts?: Partial<JobOptions>,
    callContext?: TCallContext,
  ): ReturnType<AddQueue['add']> => {
    const kind = options.queue.priorityKind
    const merged = mergeJobOptions(kind, options.defaults, perCallOpts)
    assertQueuePriority(options.queueName, kind, merged.priority ?? (kind === 'none' ? 0 : 10))
    const job =
      options.retry !== false
        ? retryTransientEnqueue(() => options.queue.add(options.jobName, data, merged))
        : options.queue.add(options.jobName, data, merged)
    reportRejectedEnqueue(job, options, 1, callContext)
    publishEnqueueAdmission({
      queue: options.queue,
      queueName: options.queueName,
      jobName: options.jobName,
      inputs: [data],
      completion: job,
    })
    const trackJobEnqueueFn = options.trackJobEnqueue ?? trackJobEnqueue
    trackJobEnqueueFn(options.queueName, options.jobName)
    return job as ReturnType<AddQueue['add']>
  }
}

export function createBulkEnqueueFunction<
  TInput,
  TData,
  TName extends string,
  TCallContext = unknown,
>(options: CreateBulkEnqueueFunctionOptions<TInput, TData, TName, TCallContext>) {
  return (
    inputs: TInput[],
    perCallOpts?: Partial<JobOptions>,
    callContext?: TCallContext,
  ): ReturnType<AddBulkQueue['addBulk']> => {
    if (inputs.length === 0) {
      return Promise.resolve([]) as ReturnType<AddBulkQueue['addBulk']>
    }

    const jobs = inputs.map((input, index) => {
      const job = options.buildJob(input, index)
      const kind = options.queue.priorityKind
      const opts = pagedDispatchRowOptions(
        options.queueName,
        options.jobName,
        job.data,
        mergeJobOptions(kind, options.defaults, job.opts, perCallOpts),
      )
      assertQueuePriority(options.queueName, kind, opts.priority ?? (kind === 'none' ? 0 : 10))
      return {
        name: options.jobName,
        data: job.data,
        opts,
      }
    })
    const add = () =>
      enqueueBulkRows(options.queue, options.queueName, jobs, {
        prefix: options.queuePrefix,
        retry: options.retry,
      })
    const checkpoint = checkpointPagedDispatchFences()
    const promise = checkpoint ? checkpoint.then(add) : add()
    reportRejectedEnqueue(promise, options, inputs.length, callContext)
    publishEnqueueAdmission({
      queue: options.queue,
      queueName: options.queueName,
      jobName: options.jobName,
      inputs: jobs.map(job => job.data),
      completion: promise,
    })
    const trackJobEnqueueFn = options.trackJobEnqueue ?? trackJobEnqueue
    trackJobEnqueueFn(options.queueName, options.jobName, inputs.length)
    return promise as ReturnType<AddBulkQueue['addBulk']>
  }
}

function mergeJobOptions(
  kind: QueuePriorityKind,
  ...options: Array<Partial<JobOptions> | undefined>
): JobOptions {
  return Object.assign(
    {},
    ENQUEUE_BASE_DEFAULTS,
    { priority: kind === 'none' ? 0 : 10 },
    ...options,
  ) as JobOptions
}

function reportRejectedEnqueue<TCallContext>(
  promise: Promise<unknown>,
  options: {
    queueName: string
    jobName: string
    decorateError?: (
      error: ErrorWithReportingContext,
      context: EnqueueErrorContext<TCallContext>,
    ) => Error
  },
  count: number,
  callContext?: TCallContext,
): void {
  promise.catch(err => {
    const localErr = toErrorWithReportingContext(err)
    onError(
      options.decorateError?.(localErr, {
        queueName: options.queueName,
        jobName: options.jobName,
        count,
        callContext,
      }) ?? localErr,
    )
  })
}

function toErrorWithReportingContext(error: unknown): ErrorWithReportingContext {
  return error instanceof Error ? error : new Error(String(error), { cause: error })
}
