import { createWorker, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import type { Job, Worker } from 'glide-mq'
import { cleanupAbandonedUploads } from '@services/images/cleanup-abandoned-uploads'
import { IMAGES_QUEUE_NAME } from '@queues/images/config'
import { processExtractImageMetadata } from './extract-metadata.mts'
import { processStaydownHash } from './staydown-hash.mts'

type ImagesJobData =
  | {/* cleanup-abandoned-uploads */}
  | { id: string /* extract-metadata, staydown-hash */ }

type CreateImagesWorkerOptions = {
  prefix?: string
  cleanupAbandonedUploads?: typeof cleanupAbandonedUploads
}

export function createImagesWorker({
  prefix = workerQueuePrefix,
  cleanupAbandonedUploads: cleanup = cleanupAbandonedUploads,
}: CreateImagesWorkerOptions = {}): Worker<ImagesJobData> {
  async function handleImagesJob(job: Job<ImagesJobData>): Promise<unknown> {
    switch (job.name) {
      case 'cleanup-abandoned-uploads':
        return cleanup()
      case 'extract-metadata': {
        const data = job.data as { id: string }
        await processExtractImageMetadata(data.id)
        return { success: true }
      }
      case 'staydown-hash': {
        const data = job.data as { id: string }
        await processStaydownHash(data.id)
        return { success: true }
      }
      default:
        throw new Error(`Unknown job name: ${job.name}`)
    }
  }

  return createWorker(IMAGES_QUEUE_NAME, handleImagesJob, {
    dedicatedCommandClient: true,
    prefix,
    concurrency: getWorkerConcurrency('images', { baseline: 5 }),
    lockDuration: 120_000,
    stalledInterval: 30_000,
  })
}
