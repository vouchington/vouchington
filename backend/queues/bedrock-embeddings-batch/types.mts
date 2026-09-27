export type BedrockEmbeddingsBatchCreationJob =
  | 'topics'
  | 'posts'
  | 'rss_feed_items'
  | 'crawl_chunks'
  | 'images'

export type BedrockEmbeddingsBatchPollingJob = 'poll_batch'

export type ReconciliationEntityType = 'topics' | 'posts' | 'rss_feed_items'
export type ReconciliationJobName =
  | 'reconcile_existing'
  | 'post_trigger_recovery'
  | 'rss_story_trigger_recovery'

export type ReconciliationFlow =
  | `copy:${ReconciliationEntityType}`
  | 'post-trigger'
  | 'rss-story-trigger'

export type BedrockEmbeddingsBatchDispatcherJob =
  | 'poll_dispatcher'
  | 'creation_dispatcher'
  | 'backlog_dispatcher'
  | 'stale_cleanup_dispatcher'
