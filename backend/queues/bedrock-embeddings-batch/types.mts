export type ReconciliationEntityType = 'topics' | 'posts' | 'rss_feed_items'

export type ReconciliationFlow = `copy:${ReconciliationEntityType}` | 'post-trigger'

export type BedrockEmbeddingsBatchDispatcherJob =
  | 'poll_dispatcher'
  | 'creation_dispatcher'
  | 'backlog_dispatcher'
  | 'stale_cleanup_dispatcher'

export type EmbeddingScanCursor = {
  sweepStartedAt: string
  afterId?: string
  afterOrderIndex?: number
  pendingImageIds?: string[]
}
