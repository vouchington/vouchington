export type BloomFilterProcessorJobs =
  | 'processRebuildBloomFilter'
  | 'processBackfillBloomFilter'
  | 'processBackfillUserBookmarkBloomFilter'
  | 'processDeleteUserBookmarkBloomFilter'
  | 'processRebuildEmbeddingBloomFilter'

export type BloomFilterRebuildInput =
  | 'url-blocklist'
  | 'email-blocklist'
  | 'embedding'
  | 'entity-cache'
  | 'api-keys'

export type RebuildBloomFilterData = {
  filter: Exclude<BloomFilterRebuildInput, 'entity-cache'>
}

export type BloomFilterEntityType = 'posts' | 'topics' | 'users' | 'communities' | 'rss_feed_items'

export type BackfillBloomFilterData = {
  entityType: BloomFilterEntityType
}

export type BackfillUserBookmarkBloomFilterData = {
  userId: string
}

export type DeleteUserBookmarkBloomFilterData = {
  userId: string
}

export type RebuildEmbeddingBloomFilterData = Record<string, never>
