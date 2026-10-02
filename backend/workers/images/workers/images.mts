import { Worker, type Job } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { cleanupAbandonedUploads } from '@services/images/cleanup-abandoned-uploads'
import { IMAGES_QUEUE_NAME } from '@queues/images/config'
import { processExtractImageMetadata } from '../processors/extract-metadata.mts'
import { processStaydownHash } from '../processors/staydown-hash.mts'

type ImagesJobData =
  | {/* cleanup-abandoned-uploads */}
  | { id: string /* extract-metadata, staydown-hash */ }

export async function handleImagesJob(job: Job<ImagesJobData>): Promise<unknown> {
  switch (job.name) {
    case 'cleanup-abandoned-uploads':
      return cleanupAbandonedUploads()
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

export const images = new Worker(IMAGES_QUEUE_NAME, handleImagesJob, {
  connection: workerQueueConnection,
  prefix: workerQueuePrefix,
  concurrency: getWorkerConcurrency('images', { baseline: 5 }),
  lockDuration: 120_000,
  stalledInterval: 30_000,
})
