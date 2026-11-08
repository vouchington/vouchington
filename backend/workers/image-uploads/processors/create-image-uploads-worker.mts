import { createWorker, type NamedQueueJob, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { IMAGE_UPLOADS_QUEUE_NAME } from '@queues/image-uploads/config'
import type { ImageUploadJobPayloads } from '@queues/image-uploads/types'
import type { Worker, WorkerOptions } from 'glide-mq'
import { processExtractImageMetadata } from './extract-metadata.mts'

export function createImageUploadsWorker(
  prefix = workerQueuePrefix,
  workerOptions?: Pick<WorkerOptions, 'blockTimeout'>,
): Worker<ImageUploadJobPayloads['extract-metadata']> {
  return createWorker<
    ImageUploadJobPayloads['extract-metadata'],
    unknown,
    NamedQueueJob<ImageUploadJobPayloads>
  >(
    IMAGE_UPLOADS_QUEUE_NAME,
    async job => {
      const jobName: string = job.name
      if (jobName !== 'extract-metadata') throw new Error(`Unknown job name: ${jobName}`)
      await processExtractImageMetadata(job.data.id)
      return { success: true }
    },
    {
      dedicatedCommandClient: true,
      prefix,
      concurrency: getWorkerConcurrency('imageUploads', { baseline: 5 }),
      lockDuration: 120_000,
      stalledInterval: 30_000,
      ...(workerOptions?.blockTimeout === undefined
        ? {}
        : { blockTimeout: workerOptions.blockTimeout }),
    },
  )
}
