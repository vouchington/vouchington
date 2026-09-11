import onError from '@modules/on-error'
import { trackJobEnqueue } from '@data-stores/analytics/queue'
import { type JobOptions, type Queue } from 'glide-mq'
import { retryTransientEnqueue } from './glide-mq-retry.mts'

type AddQueue = Pick<Queue<any>, 'add'>
type AddBulkQueue = Pick<Queue<any>, 'addBulk'>

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
    const merged = mergeJobOptions(options.defaults, perCallOpts)
    const job =
      options.retry !== false
        ? retryTransientEnqueue(() => options.queue.add(options.jobName, data, merged))
        : options.queue.add(options.jobName, data, merged)
    reportRejectedEnqueue(job, options, 1, callContext)
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
      return {
        name: options.jobName,
        data: job.data,
        opts: mergeJobOptions(options.defaults, job.opts, perCallOpts),
      }
    })

    const promise =
      options.retry !== false
        ? retryTransientEnqueue(() => options.queue.addBulk(jobs))
        : options.queue.addBulk(jobs)
    reportRejectedEnqueue(promise, options, inputs.length, callContext)
    const trackJobEnqueueFn = options.trackJobEnqueue ?? trackJobEnqueue
    trackJobEnqueueFn(options.queueName, options.jobName, inputs.length)
    return promise as ReturnType<AddBulkQueue['addBulk']>
  }
}

function mergeJobOptions(...options: Array<Partial<JobOptions> | undefined>): JobOptions {
  return Object.assign({}, ENQUEUE_BASE_DEFAULTS, ...options) as JobOptions
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
  promise.catch(error => {
    const err = toErrorWithReportingContext(error)
    onError(
      options.decorateError?.(err, {
        queueName: options.queueName,
        jobName: options.jobName,
        count,
        callContext,
      }) ?? err,
    )
  })
}

function toErrorWithReportingContext(error: unknown): ErrorWithReportingContext {
  return error instanceof Error ? error : new Error(String(error), { cause: error })
}
