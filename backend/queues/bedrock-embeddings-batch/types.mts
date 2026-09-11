export type BedrockEmbeddingsBatchCreationJob =
  | 'topics'
  | 'posts'
  | 'rss_feed_items'
  | 'crawl_chunks'
  | 'images'

export type BedrockEmbeddingsBatchPollingJob = 'poll_batch'

export type BedrockEmbeddingsBatchDispatcherJob =
  | 'poll_dispatcher'
  | 'creation_dispatcher'
  | 'backlog_dispatcher'
  | 'stale_cleanup_dispatcher'
