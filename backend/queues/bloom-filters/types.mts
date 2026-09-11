export type BloomFilterProcessorJobs =
  | 'processRebuildBloomFilter'
  | 'processPopulateBloomFilter'
  | 'processBackfillBloomFilter'
  | 'processBackfillUserBookmarkBloomFilter'
  | 'processDeleteUserBookmarkBloomFilter'
  | 'processRebuildEmbeddingBloomFilter'

export const BLOOM_FILTER_REBUILD_INPUTS = [
  'url-blocklist',
  'email-blocklist',
  'embedding',
  'entity-cache',
  'api-keys',
] as const

export type BloomFilterRebuildInput = (typeof BLOOM_FILTER_REBUILD_INPUTS)[number]

export type RebuildBloomFilterData = {
  filter: Exclude<BloomFilterRebuildInput, 'entity-cache'>
}

export type PopulateBloomFilterData = object

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

export type RebuildEmbeddingBloomFilterData = object
