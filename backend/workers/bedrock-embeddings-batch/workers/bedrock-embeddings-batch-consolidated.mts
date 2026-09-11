import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { Worker, type Job } from 'glide-mq'
import { QUEUE_NAME } from '@queues/bedrock-embeddings-batch/config'
import { processBedrockEmbeddingsBatchJob } from '../processors/worker-router.mts'

type JobData = Record<string, unknown>

export const bedrock_embeddings_batch = new Worker(
  QUEUE_NAME,
  /* v8 ignore next -- Worker constructor callback is covered through processBedrockEmbeddingsBatchJob. */
  (job: Job<JobData>): Promise<unknown> =>
    processBedrockEmbeddingsBatchJob(job, bedrock_embeddings_batch),
  {
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
    concurrency: getWorkerConcurrency('bedrockEmbeddingsBatch', { baseline: 5 }),
    lockDuration: 300_000,
    stalledInterval: 30_000,
  },
)
