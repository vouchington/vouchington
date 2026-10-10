import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import type { Job } from 'glide-mq'
import { QUEUE_NAME } from '@queues/bedrock-embeddings-batch/config'
import { processBedrockEmbeddingsBatchJob } from '../processors/worker-router.mts'

type JobData = Record<string, unknown>

export const bedrock_embeddings_batch = createWorker(
  QUEUE_NAME,
  /* v8 ignore next -- Worker constructor callback is covered through processBedrockEmbeddingsBatchJob. */
  (job: Job<JobData>): Promise<unknown> =>
    processBedrockEmbeddingsBatchJob(job, bedrock_embeddings_batch),
  {
    dedicatedCommandClient: true,
    concurrency: getWorkerConcurrency('bedrockEmbeddingsBatch', { baseline: 5 }),
    lockDuration: 300_000,
    stalledInterval: 30_000,
  },
)
