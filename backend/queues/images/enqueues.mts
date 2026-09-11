import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import { IMAGES_QUEUE_NAME, PRIORITY_DEFAULT, PRIORITY_HIGH } from './config.mts'
import { imagesQueue } from './queues.mts'

const enqueueCleanupAbandonedUploadsJob = createEnqueueFunction({
  queue: imagesQueue,
  queueName: IMAGES_QUEUE_NAME,
  jobName: 'cleanup-abandoned-uploads' as const,
})

export function enqueueCleanupAbandonedUploads(): EnqueueReturnType {
  return enqueueCleanupAbandonedUploadsJob({}, { priority: PRIORITY_DEFAULT })
}

const enqueueExtractImageMetadataJob = createEnqueueFunction<{ id: string }, 'extract-metadata'>({
  queue: imagesQueue,
  queueName: IMAGES_QUEUE_NAME,
  jobName: 'extract-metadata',
})

export function enqueueExtractImageMetadata(imageId: string): EnqueueReturnType {
  return enqueueExtractImageMetadataJob(
    { id: imageId },
    {
      priority: PRIORITY_HIGH,
      deduplication: {
        id: `extract-image-metadata-${imageId}`,
        mode: 'simple',
      },
    },
  )
}
