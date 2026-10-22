export const PRIORITY_DEFAULT = 10
export const PRIORITY_DISPATCHER = 100
export const BEDROCK_EMBEDDINGS_CREATION_QUEUE_NAME = 'bedrock-embeddings-creation'
export const BEDROCK_EMBEDDINGS_BATCH_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
  deduplicationTtlMs: 60_000,
}

export const BEDROCK_EMBEDDINGS_CREATION_JOB_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
  lockDuration: 300_000,
}

export const BEDROCK_EMBEDDINGS_CREATION_JOB_NAMES = {
  topics: 'bedrock-embeddings.create_topics',
  posts: 'bedrock-embeddings.create_posts',
  rss_feed_items: 'bedrock-embeddings.create_rss_feed_items',
  crawl_chunks: 'bedrock-embeddings.create_crawl_chunks',
  images: 'bedrock-embeddings.create_images',
} as const
