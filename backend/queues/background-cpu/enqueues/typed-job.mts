import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { BACKGROUND_CPU_QUEUE_NAME } from '../config.mts'
import { backgroundCpu } from '../queues.mts'
import { requireBackgroundCpuJob } from './registry.mts'
import type { BackgroundCpuJobPayloads } from '../types.mts'

/** Resolves both the payload type and queue defaults from one registered job name. */
export function createBackgroundCpuEnqueueFunction<TName extends keyof BackgroundCpuJobPayloads>(
  jobName: TName,
) {
  return createEnqueueFunction<BackgroundCpuJobPayloads[TName], TName>({
    queue: backgroundCpu,
    queueName: BACKGROUND_CPU_QUEUE_NAME,
    jobName,
    defaults: requireBackgroundCpuJob(jobName).options,
  })
}
