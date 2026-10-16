import type { Job } from 'glide-mq'
import type { BackgroundHandler, BackgroundJobDefinition } from '../types.mts'

export function backgroundHandler<TData>(
  job: BackgroundJobDefinition<TData>,
  handle: (job: Job<TData>) => unknown,
): BackgroundHandler<TData> {
  return { job, handle }
}
