import type { JobOptions, Queue } from 'glide-mq'
import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { NoSensitiveFields } from '@data-stores/valkey-glide-mq/glide-mq-payload-types'
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

/** An enqueue helper for one registered job; per-call options override the job's defaults. */
export function createBackgroundEnqueue<TData>(
  job: BackgroundJobDefinition<TData, true> & { sensitive: true },
  options?: BackgroundEnqueueOptions,
): Enqueue<TData>
export function createBackgroundEnqueue<TData>(
  job: BackgroundJobDefinition<TData, false>,
  options?: BackgroundEnqueueOptions,
): Enqueue<NoSensitiveFields<TData>>
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
export function createBackgroundBulkEnqueue<TInput, TData>(
  job: BackgroundJobDefinition<TData, true> & { sensitive: true },
  buildJob: (input: TInput, index: number) => { data: TData; opts?: Partial<JobOptions> },
  options?: BackgroundEnqueueOptions,
): BulkEnqueue<TInput>
export function createBackgroundBulkEnqueue<TInput, TData>(
  job: BackgroundJobDefinition<TData, false>,
  buildJob: (
    input: TInput,
    index: number,
  ) => { data: NoSensitiveFields<TData>; opts?: Partial<JobOptions> },
  options?: BackgroundEnqueueOptions,
): BulkEnqueue<TInput>
export function createBackgroundBulkEnqueue<TInput, TData>(
  job: BackgroundJobDefinition<TData>,
  buildJob: (input: TInput, index: number) => { data: TData; opts?: Partial<JobOptions> },
  options: BackgroundEnqueueOptions = {},
) {
  if (job.sensitive) {
    return createBulkEnqueueFunction<TInput, TData, string>({
      ...options,
      queue: background,
      queueName: BACKGROUND_QUEUE_NAME,
      jobName: job.name,
      defaults: job.options,
      buildJob,
      sensitive: true,
    })
  }
  return createBulkEnqueueFunction<TInput, TData, string>({
    ...options,
    queue: background,
    queueName: BACKGROUND_QUEUE_NAME,
    jobName: job.name,
    defaults: job.options,
    buildJob: buildJob as (
      input: TInput,
      index: number,
    ) => { data: NoSensitiveFields<TData>; opts?: Partial<JobOptions> },
  })
}
