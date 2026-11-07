import type { EnqueueReturnType } from '@voucha/types'
import { createBackgroundCpuEnqueueFunction } from '@queues/background-cpu/enqueues/typed-job'

const enqueueCleanupJob = createBackgroundCpuEnqueueFunction(
  'content-analysis.cleanup-abandoned-uploads',
)

export function enqueueCleanupAbandonedUploads(): EnqueueReturnType {
  return enqueueCleanupJob({}, { priority: 100 })
}

const enqueueStaydownHashJob = createBackgroundCpuEnqueueFunction('content-analysis.staydown-hash')

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
