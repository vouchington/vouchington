import type { Job } from 'glide-mq'
import type { BackgroundCpuHandler, BackgroundCpuJobDefinition } from '../types.mts'

export function backgroundHandler<TData>(
  job: BackgroundCpuJobDefinition<TData>,
  handle: (job: Job<TData>) => unknown,
): BackgroundCpuHandler<TData> {
  return { job, handle }
}

/**
 * Hands the job's payload to a processor that takes it first. Any further parameter is an injected
 * dependency, so the processor is never handed the job itself.
 */
export function backgroundDataHandler<TData>(
  job: BackgroundCpuJobDefinition<TData>,
  process: (data: TData) => unknown,
): BackgroundCpuHandler<TData> {
  return backgroundHandler(job, queued => process(queued.data))
}

/**
 * Hands the job's continuation payload to a sweep whose leading parameter is its injected
 * dependencies, which a job leaves at their production defaults.
 */
export function backgroundContinuationHandler<TData>(
  job: BackgroundCpuJobDefinition<TData>,
  process: (dependencies: Record<string, never>, data: TData) => unknown,
): BackgroundCpuHandler<TData> {
  return backgroundHandler(job, queued => process({}, queued.data))
}

/**
 * Runs a processor that reads nothing from the job. It is called without arguments because a
 * processor's first parameter is its injected dependencies, which the job must never fill.
 */
export function backgroundSweepHandler<TData>(
  job: BackgroundCpuJobDefinition<TData>,
  process: () => unknown,
): BackgroundCpuHandler<TData> {
  return backgroundHandler(job, () => process())
}
