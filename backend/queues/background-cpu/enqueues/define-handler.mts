import type { Job } from 'glide-mq'
import type { BackgroundCpuHandler, BackgroundCpuJobDefinition } from '../types.mts'

export function backgroundHandler<TData>(
  job: BackgroundCpuJobDefinition<TData>,
  handle: (job: Job<TData>) => unknown,
): BackgroundCpuHandler<TData> {
  return { job, handle }
}
