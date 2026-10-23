import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { backgroundCpu } from '@queues/background-cpu/queues'
import type { CleanupAbandonedUploadsData } from '../types.mts'

const enqueueCleanupJob = createEnqueueFunction<
  CleanupAbandonedUploadsData,
  'content-analysis.cleanup-abandoned-uploads'
>({
  queue: backgroundCpu,
  queueName: BACKGROUND_CPU_QUEUE_NAME,
  jobName: 'content-analysis.cleanup-abandoned-uploads' as const,
  defaults: requireBackgroundCpuJob('content-analysis.cleanup-abandoned-uploads').options,
})

export function enqueueCleanupAbandonedUploads(): EnqueueReturnType {
  return enqueueCleanupJob({}, { priority: 100 })
}

const enqueueStaydownHashJob = createEnqueueFunction<{ id: string }, string>({
  queue: backgroundCpu,
  queueName: BACKGROUND_CPU_QUEUE_NAME,
  jobName: 'content-analysis.staydown-hash',
  defaults: requireBackgroundCpuJob('content-analysis.staydown-hash').options,
})

export function enqueueStaydownHash(
  imageId: string,
  source: 'upload' | 'registration',
): EnqueueReturnType {
  return enqueueStaydownHashJob(
    { id: imageId },
    {
      priority: 10,
      deduplication: { id: `content-analysis:staydown-hash:${source}:${imageId}`, mode: 'simple' },
    },
  )
}
