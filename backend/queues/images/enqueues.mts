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
  const jobId = `extract-image-metadata-${imageId}`
  return enqueueExtractImageMetadataJob(
    { id: imageId },
    {
      priority: PRIORITY_HIGH,
      jobId,
      deduplication: { id: jobId, mode: 'simple' },
    },
  )
}

const enqueueStaydownHashJob = createEnqueueFunction<{ id: string }, 'staydown-hash'>({
  queue: imagesQueue,
  queueName: IMAGES_QUEUE_NAME,
  jobName: 'staydown-hash',
})

/**
 * Hashes an image for the copyright staydown registry and matches it against the registry. An
 * upload and a registration are separate sources so one never dedupes the other away while its job
 * is still in flight.
 */
export function enqueueStaydownHash(
  imageId: string,
  source: 'upload' | 'registration',
): EnqueueReturnType {
  return enqueueStaydownHashJob(
    { id: imageId },
    {
      priority: PRIORITY_DEFAULT,
      deduplication: {
        id: `staydown-hash-${source}-${imageId}`,
        mode: 'simple',
      },
    },
  )
}
