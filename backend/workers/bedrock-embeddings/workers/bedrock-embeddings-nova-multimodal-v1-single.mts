import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { Worker, type Job } from 'glide-mq'
import { processBedrockNovaMultimodalV1SingleJob } from '../processors/nova-multimodal-v1-single.mts'

export const bedrock_embeddings_nova_multimodal_v1_single = new Worker(
  'bedrock_embeddings_nova_multimodal_v1_single',
  (job: Job<{ id?: string; rss_feed_item_id?: string }>): Promise<unknown> =>
    processBedrockNovaMultimodalV1SingleJob(job, bedrock_embeddings_nova_multimodal_v1_single),
  {
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
    concurrency: getWorkerConcurrency('bedrockEmbeddingsNovaMultimodalV1Single', { baseline: 5 }),
    limiter: { max: 10, duration: 1000 },
  },
)
