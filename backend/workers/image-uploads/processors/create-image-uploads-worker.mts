import { createWorker, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { IMAGE_UPLOADS_QUEUE_NAME } from '@queues/image-uploads/config'
import type { Job, Worker, WorkerOptions } from 'glide-mq'
import {
  processExtractImageMetadata,
  type ProcessExtractImageMetadataDeps,
} from './extract-metadata.mts'

export function createImageUploadsWorker(
  prefix = workerQueuePrefix,
  extractDeps: Partial<ProcessExtractImageMetadataDeps> = {},
  workerOptions?: Pick<WorkerOptions, 'blockTimeout'>,
): Worker<{ id: string }> {
  return createWorker(
    IMAGE_UPLOADS_QUEUE_NAME,
    async (job: Job<{ id: string }>) => {
      if (job.name !== 'extract-metadata') throw new Error(`Unknown job name: ${job.name}`)
      await processExtractImageMetadata(job.data.id, extractDeps)
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
