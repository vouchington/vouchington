import type { JobOptions } from 'glide-mq'
import type {
  BackfillBloomFilterData,
  BackfillUserBookmarkBloomFilterData,
  DeleteUserBookmarkBloomFilterData,
  RebuildBloomFilterData,
} from './types.mts'

export const QUEUE_NAME = 'bloom-filters'
export const PRIORITY_DEFAULT = 10
export const BLOOM_FILTER_LOCK_DURATION_MS = 600_000
export const BLOOM_FILTER_STALLED_INTERVAL_MS = 30_000

export const BLOOM_FILTER_ORDERING = {
  populate_embedding: { key: 'openai-text-embedding-3-small', concurrency: 1 },
  rebuild_embedding: { key: 'openai-text-embedding-3-small', concurrency: 1 },
  rebuild_url_blocklist: { key: 'url-blocklist', concurrency: 1 },
  rebuild_email_blocklist: { key: 'email-blocklist', concurrency: 1 },
  rebuild_api_keys: { key: 'api-keys', concurrency: 1 },
  backfill_posts: { key: 'entity-cache:posts', concurrency: 1 },
  backfill_topics: { key: 'entity-cache:topics', concurrency: 1 },
  backfill_users: { key: 'entity-cache:users', concurrency: 1 },
  backfill_communities: { key: 'entity-cache:communities', concurrency: 1 },
  backfill_rss_feed_items: { key: 'entity-cache:rss_feed_items', concurrency: 1 },
} as const

const EMBEDDING_BLOOM_FILTER_DEDUPLICATION_ID = 'bloom-filter__openai-text-embedding-3-small'

const BLOOM_FILTER_JOB_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
} satisfies Partial<JobOptions>

export function populateBloomFilterJobOptions(priority?: number): Partial<JobOptions> {
  return {
    ...BLOOM_FILTER_JOB_DEFAULTS,
    priority: priority ?? PRIORITY_DEFAULT,
    ordering: BLOOM_FILTER_ORDERING.populate_embedding,
    deduplication: {
      id: EMBEDDING_BLOOM_FILTER_DEDUPLICATION_ID,
      mode: 'simple',
    },
  } satisfies Partial<JobOptions>
}

export function backfillBloomFilterJobOptions(
  data: BackfillBloomFilterData,
  priority?: number,
): Partial<JobOptions> {
  return {
    ...BLOOM_FILTER_JOB_DEFAULTS,
    priority: priority ?? PRIORITY_DEFAULT,
    ordering: BLOOM_FILTER_ORDERING[`backfill_${data.entityType}`],
    deduplication: {
      id: `processBackfillBloomFilter__${data.entityType}`,
      mode: 'simple' as const,
    },
  } satisfies Partial<JobOptions>
}

export function backfillUserBookmarkBloomFilterJobOptions(
  data: BackfillUserBookmarkBloomFilterData,
  priority?: number,
): Partial<JobOptions> {
  return {
    ...BLOOM_FILTER_JOB_DEFAULTS,
    priority: priority ?? PRIORITY_DEFAULT,
    ordering: { key: `bookmark:${data.userId}`, concurrency: 1 },
    deduplication: {
      id: `processBackfillUserBookmarkBloomFilter__${data.userId}`,
      mode: 'simple' as const,
    },
  } satisfies Partial<JobOptions>
}

export function deleteUserBookmarkBloomFilterJobOptions(
  data: DeleteUserBookmarkBloomFilterData,
  priority?: number,
): Partial<JobOptions> {
  return {
    ...BLOOM_FILTER_JOB_DEFAULTS,
    priority: priority ?? PRIORITY_DEFAULT,
    // Same ordering key as the backfill job: both mutate the same user's filter, so they must
    // never run concurrently against each other.
    ordering: { key: `bookmark:${data.userId}`, concurrency: 1 },
    deduplication: {
      id: `processDeleteUserBookmarkBloomFilter__${data.userId}`,
      mode: 'simple' as const,
    },
  } satisfies Partial<JobOptions>
}

export function rebuildBloomFilterJobOptions(
  data: RebuildBloomFilterData,
  priority?: number,
): Partial<JobOptions> {
  return {
    ...BLOOM_FILTER_JOB_DEFAULTS,
    priority: priority ?? PRIORITY_DEFAULT,
    ordering: rebuildBloomFilterOrdering(data),
    deduplication: {
      id:
        data.filter === 'embedding'
          ? EMBEDDING_BLOOM_FILTER_DEDUPLICATION_ID
          : `processRebuildBloomFilter__${data.filter}`,
      mode: 'simple' as const,
    },
  } satisfies Partial<JobOptions>
}

function rebuildBloomFilterOrdering(data: RebuildBloomFilterData): JobOptions['ordering'] {
  switch (data.filter) {
    case 'url-blocklist':
      return BLOOM_FILTER_ORDERING.rebuild_url_blocklist
    case 'email-blocklist':
      return BLOOM_FILTER_ORDERING.rebuild_email_blocklist
    case 'embedding':
      return BLOOM_FILTER_ORDERING.rebuild_embedding
    case 'api-keys':
      return BLOOM_FILTER_ORDERING.rebuild_api_keys
  }
}

export function rebuildEmbeddingBloomFilterJobOptions(priority?: number): Partial<JobOptions> {
  return {
    ...BLOOM_FILTER_JOB_DEFAULTS,
    priority: priority ?? PRIORITY_DEFAULT,
    ordering: BLOOM_FILTER_ORDERING.rebuild_embedding,
    deduplication: {
      id: EMBEDDING_BLOOM_FILTER_DEDUPLICATION_ID,
      mode: 'simple',
    },
  } satisfies Partial<JobOptions>
}
