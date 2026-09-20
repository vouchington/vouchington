import type { WorkerDefinition } from '@backend/worker-runtime'
import { WORKER_DEFINITIONS as IO_WORKER_DEFINITIONS } from '@entrypoints/worker-io/worker-definitions'
import { LANGUAGE_DETECTION_QUEUE_NAME } from '@queues/language-detection/config'
import { UNFURL_REFERRAL_LINKS_QUEUE_NAME } from '@queues/unfurl-referral-links/config'

export const CPU_ONLY_WORKER_DEFINITIONS: WorkerDefinition[] = [
  {
    queueName: 'crawl_urls',
    load: () => import('@workers/crawler/workers').then(module => module.crawlUrls),
  },
  {
    queueName: 'crawl_hostnames',
    load: () => import('@workers/crawl-hostnames/workers').then(module => module.crawlHostnames),
  },
  {
    queueName: 'crawl_referral_links',
    load: () =>
      import('@workers/crawl-referral-links/workers').then(module => module.crawlReferralLinks),
  },
  {
    queueName: 'crawl_html_boilerplate_removal',
    load: () =>
      import('@workers/crawl-boilerplate-removal/workers').then(
        module => module.boilerplateRemoval,
      ),
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
    queueName: 'images',
    load: () => import('@workers/images/workers').then(module => module.images),
  },
  {
    queueName: 'ai_agents',
    load: () => import('@workers/ai-agents/workers').then(module => module.ai_agents),
  },
  {
    queueName: 'openai-spend-cap-rechecks',
    load: () =>
      import('@workers/ai-agents/workers/spend-cap-recheck').then(
        module => module.openAiSpendCapRechecks,
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
    queueName: 'bedrock-embeddings-batch',
    load: () =>
      import('@workers/bedrock-embeddings-batch/workers').then(
        module => module.bedrock_embeddings_batch,
      ),
  },
  {
    queueName: LANGUAGE_DETECTION_QUEUE_NAME,
    load: () =>
      import('@workers/language-detection/workers').then(module => module.languageDetection),
  },
]

export const WORKER_DEFINITIONS: WorkerDefinition[] = [
  ...CPU_ONLY_WORKER_DEFINITIONS,
  ...IO_WORKER_DEFINITIONS,
]
