import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import { CONTENT_ANALYSIS_QUEUE_NAME } from '../config.mts'
import { contentAnalysisQueue } from '../queues.mts'

const enqueueCleanupJob = createEnqueueFunction({
  queue: contentAnalysisQueue,
  queueName: CONTENT_ANALYSIS_QUEUE_NAME,
  jobName: 'cleanup-abandoned-uploads' as const,
})

export function enqueueCleanupAbandonedUploads(): EnqueueReturnType {
  return enqueueCleanupJob({}, { priority: 100 })
}

const enqueueStaydownHashJob = createEnqueueFunction<{ id: string }, 'staydown-hash'>({
  queue: contentAnalysisQueue,
  queueName: CONTENT_ANALYSIS_QUEUE_NAME,
  jobName: 'staydown-hash',
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
