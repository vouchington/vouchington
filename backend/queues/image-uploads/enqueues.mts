import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { IMAGE_UPLOADS_QUEUE_NAME } from './config.mts'
import { imageUploadsQueue } from './queues.mts'

const enqueueExtractImageMetadataJob = createEnqueueFunction<{ id: string }, 'extract-metadata'>({
  queue: imageUploadsQueue,
  queueName: IMAGE_UPLOADS_QUEUE_NAME,
  jobName: 'extract-metadata',
})

/**
 * One in-flight extraction per image, with no custom `jobId`. A stable `jobId` is a hard uniqueness
 * key that outlives the job while a completed or failed record is retained, so the hourly
 * `cleanupAbandonedUploads` recovery would get `null` back and silently skip the image. `simple`
 * deduplication collapses duplicates while a job is waiting, active, or retrying, and releases
 * when that job finishes, including a terminal stall.
 */
export function getExtractImageMetadataJobOptions(imageId: string) {
  return {
    deduplication: { id: `extract-image-metadata-${imageId}`, mode: 'simple' },
  } satisfies Partial<JobOptions>
}

export function enqueueExtractImageMetadata(imageId: string): EnqueueReturnType {
  return enqueueExtractImageMetadataJob({ id: imageId }, getExtractImageMetadataJobOptions(imageId))
}
