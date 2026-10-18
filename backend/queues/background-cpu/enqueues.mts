import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { JobOptions } from 'glide-mq'
import { BACKGROUND_CPU_QUEUE_NAME } from './config.mts'
import type { BackgroundCpuJobDefinition } from './types.mts'
import { backgroundCpu } from './queues.mts'

type EnqueueOptions = Parameters<typeof createEnqueueFunction>[0]

/** An enqueue helper for one registered job; per-call options override the job's defaults. */
export function createBackgroundCpuEnqueue<TData>(
  job: BackgroundCpuJobDefinition<TData>,
  options: Pick<EnqueueOptions, 'decorateError' | 'retry'> = {},
) {
  return createEnqueueFunction<TData, string>({
    ...options,
    queue: backgroundCpu,
    queueName: BACKGROUND_CPU_QUEUE_NAME,
    jobName: job.name,
    defaults: job.options,
  })
}

/** A bulk enqueue helper for one registered job; `buildJob` may add per-input options. */
export function createBackgroundCpuBulkEnqueue<TInput, TData>(
  job: BackgroundCpuJobDefinition<TData>,
  buildJob: (input: TInput, index: number) => { data: TData; opts?: Partial<JobOptions> },
  options: Pick<EnqueueOptions, 'decorateError' | 'retry'> = {},
) {
  return createBulkEnqueueFunction<TInput, TData, string>({
    ...options,
    queue: backgroundCpu,
    queueName: BACKGROUND_CPU_QUEUE_NAME,
    jobName: job.name,
    defaults: job.options,
    buildJob,
  })
}
