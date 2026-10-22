import type { WorkerDefinition } from '@backend/worker-runtime'
import { WORKER_DEFINITIONS as IO_WORKER_DEFINITIONS } from '@entrypoints/worker-io/worker-definitions'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { BEDROCK_EMBEDDINGS_CREATION_QUEUE_NAME } from '@queues/bedrock-embeddings-batch/config'

export const WORKER_DEFINITIONS: WorkerDefinition[] = [
  {
    queueName: BACKGROUND_CPU_QUEUE_NAME,
    load: () => import('@workers/background-cpu/workers').then(module => module.backgroundCpu),
  },
  {
    queueName: BEDROCK_EMBEDDINGS_CREATION_QUEUE_NAME,
    load: () =>
      import('@workers/bedrock-embeddings-batch/workers').then(
        module => module.bedrockEmbeddingsCreationWorker,
      ),
  },
  {
    queueName: 'crawl_browser',
    requiresExplicitInclusion: true,
    load: () => import('@workers/crawl-browser/workers').then(module => module.crawlBrowser),
  },
  {
    queueName: 'image-uploads',
    load: () => import('@workers/image-uploads/workers').then(module => module.imageUploads),
  },
  {
    queueName: 'ai_agents',
    load: () => import('@workers/ai-agents/workers').then(module => module.ai_agents),
  },
  ...IO_WORKER_DEFINITIONS,
]
