import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { IMAGE_UPLOADS_QUEUE_NAME } from './config.mts'
import { imageUploadsQueue } from './queues.mts'

const enqueueBulkExtractMetadata = createBulkEnqueueFunction({
  queue: imageUploadsQueue,
  queueName: IMAGE_UPLOADS_QUEUE_NAME,
  jobName: 'extract-metadata',
  buildJob: (imageId: string) => ({
    data: { id: imageId },
    opts: getExtractImageMetadataJobOptions(imageId),
  }),
})

/** Recovery admits a page of images with one queue call. */
export function enqueueBulkExtractImageMetadata(imageIds: readonly string[]) {
  return enqueueBulkExtractMetadata([...imageIds])
}

export async function enqueueExtractImageMetadata(imageId: string): EnqueueReturnType {
  const [job] = await enqueueBulkExtractImageMetadata([imageId])
  return job ?? null
}

/**
 * One in-flight extraction per image, with no custom `jobId`. A stable `jobId` is a hard uniqueness
 * key that outlives the job while a completed or failed record is retained, so the hourly
 * `cleanupAbandonedUploads` recovery would get `null` back and silently skip the image. `simple`
 * deduplication collapses duplicates while a job is waiting, active, or retrying, and releases
 * when that job finishes, including a terminal stall.
 */
function getExtractImageMetadataJobOptions(imageId: string) {
  return {
    deduplication: { id: `extract-image-metadata-${imageId}`, mode: 'simple' },
  } satisfies Partial<JobOptions>
}
