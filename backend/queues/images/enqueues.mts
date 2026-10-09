import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
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

/**
 * One in-flight extraction per image, with no custom `jobId`. A stable `jobId` is a hard uniqueness
 * key that outlives the job: GlideMQ keeps the claim while the terminal record is retained, and a
 * job that stalls past its limit lands in the failed set without honoring `removeOnFail` at all.
 * Either way the hourly `cleanupAbandonedUploads` recovery would get `null` back and silently skip
 * the image. `simple` deduplication alone collapses duplicates while a job is waiting, active, or
 * retrying, and releases the moment that job is completed or failed, however it got there.
 */
export function getExtractImageMetadataJobOptions(imageId: string) {
  return {
    priority: PRIORITY_HIGH,
    deduplication: { id: `extract-image-metadata-${imageId}`, mode: 'simple' },
  } satisfies Partial<JobOptions>
}

export function enqueueExtractImageMetadata(imageId: string): EnqueueReturnType {
  return enqueueExtractImageMetadataJob({ id: imageId }, getExtractImageMetadataJobOptions(imageId))
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
