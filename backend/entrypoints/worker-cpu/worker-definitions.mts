import type { WorkerDefinition } from '@backend/worker-runtime'
import { WORKER_DEFINITIONS as IO_WORKER_DEFINITIONS } from '@entrypoints/worker-io/worker-definitions'
import { CONTENT_ANALYSIS_QUEUE_NAME } from '@queues/content-analysis/config'
import { UNFURL_REFERRAL_LINKS_QUEUE_NAME } from '@queues/unfurl-referral-links/config'

export const WORKER_DEFINITIONS: WorkerDefinition[] = [
  {
    queueName: 'crawl_urls',
    load: () => import('@workers/crawler/workers').then(module => module.crawlUrls),
  },
  {
    queueName: 'crawl-dispatch',
    load: () => import('@workers/crawl-dispatch/workers').then(module => module.crawlDispatch),
  },
  {
    queueName: 'crawl_referral_links',
    load: () =>
      import('@workers/crawl-referral-links/workers').then(module => module.crawlReferralLinks),
  },
  {
    queueName: 'crawl_browser',
    requiresExplicitInclusion: true,
    load: () => import('@workers/crawl-browser/workers').then(module => module.crawlBrowser),
  },
  {
    // Shares Lightpanda (crawlWithBrowser) with crawl_browser -- CPU-bucketed for the same reason.
    queueName: UNFURL_REFERRAL_LINKS_QUEUE_NAME,
    requiresExplicitInclusion: true,
    load: () =>
      import('@workers/unfurl-referral-links/workers').then(module => module.unfurlReferralLinks),
  },
  {
    queueName: 'image-uploads',
    load: () => import('@workers/image-uploads/workers').then(module => module.imageUploads),
  },
  {
    queueName: 'ai_agents',
    load: () => import('@workers/ai-agents/workers').then(module => module.ai_agents),
  },
  {
    queueName: 'ai-spend-cap-rechecks',
    load: () =>
      import('@workers/ai-agents/workers/spend-cap-recheck').then(
        module => module.spendCapRechecks,
      ),
  },
  {
    queueName: 'bedrock_embeddings_nova_multimodal_v1_single',
    load: () =>
      import('@workers/bedrock-embeddings/workers').then(
        module => module.bedrock_embeddings_nova_multimodal_v1_single,
      ),
  },
  {
    queueName: 'bedrock-embeddings-batch-creation',
    load: () =>
      import('@workers/bedrock-embeddings-batch/workers/bedrock-embeddings-batch-creation').then(
        module => module.createEmbeddingCreationWorker(),
      ),
  },
  {
    queueName: 'bedrock-embeddings-batch',
    load: () =>
      import('@workers/bedrock-embeddings-batch/workers').then(
        module => module.bedrock_embeddings_batch,
      ),
  },
  {
    queueName: CONTENT_ANALYSIS_QUEUE_NAME,
    load: () => import('@workers/content-analysis/workers').then(module => module.contentAnalysis),
  },
  ...IO_WORKER_DEFINITIONS,
]
