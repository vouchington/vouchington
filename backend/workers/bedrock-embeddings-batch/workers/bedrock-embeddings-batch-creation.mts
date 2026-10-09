import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { bedrock_embeddings_batch_creation } from '@queues/bedrock-embeddings-batch/queues'
import type { BedrockEmbeddingsBatchCreationJob } from '@queues/bedrock-embeddings-batch/types'
import { Worker, type Queue, type Job } from 'glide-mq'
import { handleBedrockRateLimit, UnrecoverableError } from '@modules/queue-errors'
import { processEmbeddingCreationJob } from '../processors/creation.mts'

const creationTypes = new Set<BedrockEmbeddingsBatchCreationJob>([
  'topics',
  'posts',
  'rss_feed_items',
  'crawl_chunks',
  'images',
])

async function processEmbeddingCreationWorkerJob(job: Job, worker: Worker) {
  const type = job.name as BedrockEmbeddingsBatchCreationJob
  if (!creationTypes.has(type))
    throw new UnrecoverableError(`Unknown creation job type: ${job.name}`)
  try {
    return await processEmbeddingCreationJob(job, type)
  } catch (err) {
    return handleBedrockRateLimit(err, worker)
  }
}

export async function createEmbeddingCreationWorker(
  queue: Queue = bedrock_embeddings_batch_creation,
): Promise<Worker> {
  // Capacity discovery and cloud reservation are separate operations. One globally active creation
  // job preserves provider budgets; delayed jobs yield this slot without retaining an ordering lane.
  await queue.setGlobalConcurrency(1)
  const worker: Worker = new Worker(
    queue.name,
    (job: Job) => processEmbeddingCreationWorkerJob(job, worker),
    {
      connection: workerQueueConnection,
      prefix: workerQueuePrefix,
      concurrency: 1,
      lockDuration: 300_000,
      stalledInterval: 30_000,
    },
  )
  return worker
}
