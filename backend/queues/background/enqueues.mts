import type { JobOptions, Queue } from 'glide-mq'
import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type {
  CreateBulkEnqueueFunctionOptions,
  GuardedBulkEnqueue,
} from '@data-stores/valkey-glide-mq/glide-mq-enqueue-types'
import type {
  HasSensitiveFields,
  NoSensitiveFields,
} from '@data-stores/valkey-glide-mq/glide-mq-payload-types'
import { BACKGROUND_QUEUE_NAME } from './config.mts'
import type { BackgroundJobDefinition } from './types.mts'
import { background } from './queues.mts'

type EnqueueOptions = Parameters<typeof createEnqueueFunction>[0]
type BackgroundEnqueueOptions = Pick<EnqueueOptions, 'decorateError' | 'retry'>
type Enqueue<TData> = (
  data: TData,
  perCallOpts?: Partial<JobOptions>,
  callContext?: unknown,
) => ReturnType<Queue['add']>
type BulkEnqueue<TInput> = (
  inputs: TInput[],
  perCallOpts?: Partial<JobOptions>,
  callContext?: unknown,
) => ReturnType<Queue['addBulk']>
type GuardedEnqueue<TData> = <TActual extends TData>(
  data: TActual &
    NoSensitiveFields<TData> &
    ([true] extends [HasSensitiveFields<TData>] ? never : unknown) &
    (TData extends Record<string, never>
      ? unknown
      : [keyof TActual] extends [never]
        ? unknown
        : ([true] extends [HasSensitiveFields<TActual>] ? never : unknown) &
            NoSensitiveFields<NoInfer<TActual>>),
  perCallOpts?: Partial<JobOptions>,
  callContext?: unknown,
) => ReturnType<Queue['add']>

type BulkEnqueueFactory = <TInput, TData, TName extends string>(
  options: CreateBulkEnqueueFunctionOptions<TInput, TData, TName>,
) => BulkEnqueue<TInput>

// The public helper overloads below prove the payload shape before entering this generic adapter.
const createVerifiedBulkEnqueue = createBulkEnqueueFunction as unknown as BulkEnqueueFactory

/** An enqueue helper for one registered job; per-call options override the job's defaults. */
export function createBackgroundEnqueue<TData>(
  job: BackgroundJobDefinition<TData, true> & { sensitive: true },
  options?: BackgroundEnqueueOptions,
): Enqueue<TData>
export function createBackgroundEnqueue<TData>(
  job: BackgroundJobDefinition<TData, false>,
  options?: BackgroundEnqueueOptions,
): GuardedEnqueue<TData>
export function createBackgroundEnqueue<TData>(
  job: BackgroundJobDefinition<TData>,
  options: BackgroundEnqueueOptions = {},
) {
  if (job.sensitive) {
    return createEnqueueFunction<TData, string>({
      ...options,
      queue: background,
      queueName: BACKGROUND_QUEUE_NAME,
      jobName: job.name,
      defaults: job.options,
      sensitive: true,
    })
  }
  return createEnqueueFunction<TData, string>({
    ...options,
    queue: background,
    queueName: BACKGROUND_QUEUE_NAME,
    jobName: job.name,
    defaults: job.options,
  })
}

/** A bulk enqueue helper for one registered job; `buildJob` may add per-input options. */
export function createBackgroundBulkEnqueue<
  TBuildJob extends (...args: never[]) => { data: unknown; opts?: Partial<JobOptions> },
  TData,
>(
  job: BackgroundJobDefinition<TData, true> & { sensitive: true },
  buildJob: TBuildJob,
  options?: BackgroundEnqueueOptions,
  ...contract: (TBuildJob extends (
    input: Parameters<TBuildJob>[0],
    index: number,
  ) => ReturnType<TBuildJob>
    ? []
    : [never]) &
    (ReturnType<TBuildJob>['data'] extends TData ? [] : [never])
): BulkEnqueue<Parameters<TBuildJob>[0]>
export function createBackgroundBulkEnqueue<
  TBuildJob extends (...args: never[]) => { data: unknown; opts?: Partial<JobOptions> },
  TData,
>(
  job: BackgroundJobDefinition<TData, false>,
  buildJob: TBuildJob,
  options?: BackgroundEnqueueOptions,
  ...contract: (TBuildJob extends (
    input: Parameters<TBuildJob>[0],
    index: number,
  ) => ReturnType<TBuildJob>
    ? []
    : [never]) &
    (ReturnType<TBuildJob>['data'] extends TData ? [] : [never]) &
    ([true] extends [HasSensitiveFields<ReturnType<TBuildJob>['data']>]
      ? [never]
      : ReturnType<TBuildJob>['data'] extends NoSensitiveFields<ReturnType<TBuildJob>['data']>
        ? []
        : [never])
): GuardedBulkEnqueue<Parameters<TBuildJob>[0]>
export function createBackgroundBulkEnqueue<
  TBuildJob extends (...args: never[]) => { data: unknown; opts?: Partial<JobOptions> },
  TData,
>(
  job: BackgroundJobDefinition<TData>,
  buildJob: TBuildJob,
  options: BackgroundEnqueueOptions = {},
  ..._contract: unknown[]
) {
  if (job.sensitive) {
    return createVerifiedBulkEnqueue({
      ...options,
      queue: background,
      queueName: BACKGROUND_QUEUE_NAME,
      jobName: job.name,
      defaults: job.options,
      buildJob: buildJob as never,
      sensitive: true,
    })
  }
  return createVerifiedBulkEnqueue({
    ...options,
    queue: background,
    queueName: BACKGROUND_QUEUE_NAME,
    jobName: job.name,
    defaults: job.options,
    buildJob: buildJob as never,
  })
}
