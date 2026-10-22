import { createWorker, workerQueueConnection } from '@data-stores/valkey-glide-mq'
import { Queue } from 'glide-mq'
import { getPauseRecheckMs } from '@queues/background-cpu/config'
import {
  BEDROCK_EMBEDDINGS_CREATION_JOB_NAMES,
  BEDROCK_EMBEDDINGS_CREATION_QUEUE_NAME,
} from '@queues/bedrock-embeddings-batch/config'
import { bedrockEmbeddingsCreation } from '@queues/bedrock-embeddings-batch/queues'
import { processEmbeddingCreationJob } from './creation.mts'
import { withBedrockRateLimit } from './bedrock-rate.mts'
import { runUnlessQueueDomainPaused } from '@services/queue-domain-controls'
import { runBedrockJobWithProviderCooldown } from '@workers/bedrock-embeddings/processors/provider-cooldown'

const CREATION_TYPES: Readonly<Record<string, Parameters<typeof processEmbeddingCreationJob>[1]>> =
  {
    [BEDROCK_EMBEDDINGS_CREATION_JOB_NAMES.topics]: 'topics',
    [BEDROCK_EMBEDDINGS_CREATION_JOB_NAMES.posts]: 'posts',
    [BEDROCK_EMBEDDINGS_CREATION_JOB_NAMES.rss_feed_items]: 'rss_feed_items',
    [BEDROCK_EMBEDDINGS_CREATION_JOB_NAMES.crawl_chunks]: 'crawl_chunks',
    [BEDROCK_EMBEDDINGS_CREATION_JOB_NAMES.images]: 'images',
  }
const CREATION_COOLDOWN_KEY = 'bedrock-embeddings:creation'

export type BedrockEmbeddingsCreationWorkerOptions = {
  /** An isolated prefix for an owned real-Glide test queue. */
  prefix?: string
}

/** Set the shared cap before a worker can consume, using the same name and prefix as the worker. */
export async function createBedrockEmbeddingsCreationWorker(
  options: BedrockEmbeddingsCreationWorkerOptions = {},
) {
  const queue = options.prefix
    ? new Queue(BEDROCK_EMBEDDINGS_CREATION_QUEUE_NAME, {
        connection: workerQueueConnection,
        prefix: options.prefix,
      })
    : bedrockEmbeddingsCreation
  try {
    await queue.setGlobalConcurrency(1)
  } finally {
    if (options.prefix) await queue.close()
  }
  return createWorker(
    BEDROCK_EMBEDDINGS_CREATION_QUEUE_NAME,
    async job => {
      const type = CREATION_TYPES[job.name]
      if (!type) throw new Error(`No embedding creation handler for ${job.name}`)
      return runUnlessQueueDomainPaused(
        'bedrock-embeddings',
        () =>
          runBedrockJobWithProviderCooldown(job, CREATION_COOLDOWN_KEY, () =>
            withBedrockRateLimit(() => processEmbeddingCreationJob(job, type)),
          ),
        () => job.moveToDelayed(Date.now() + getPauseRecheckMs()),
      )
    },
    {
      dedicatedCommandClient: true,
      concurrency: 1,
      ...(options.prefix ? { prefix: options.prefix } : {}),
    },
  )
}
