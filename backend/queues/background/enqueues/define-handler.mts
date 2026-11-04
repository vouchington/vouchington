import type { Job } from 'glide-mq'
import type { BackgroundHandler, BackgroundJobDefinition } from '../types.mts'

export function backgroundHandler<TData>(
  job: BackgroundJobDefinition<TData>,
  handle: (job: Job<TData>) => unknown,
): BackgroundHandler<TData> {
  return { job, handle }
}

/**
 * Hands the job's payload to a processor that takes it first. Any further parameter is an injected
 * dependency, so the processor is never handed the job itself.
 */
export function backgroundDataHandler<TData>(
  job: BackgroundJobDefinition<TData>,
  process: (data: TData) => unknown,
): BackgroundHandler<TData> {
  return backgroundHandler(job, queued => process(queued.data))
}

/**
 * Runs a processor that reads nothing from the job. It is called without arguments because a
 * processor's first parameter is its injected dependencies, which the job must never fill.
 */
export function backgroundSweepHandler<TData>(
  job: BackgroundJobDefinition<TData>,
  process: () => unknown,
): BackgroundHandler<TData> {
  return backgroundHandler(job, () => process())
}
