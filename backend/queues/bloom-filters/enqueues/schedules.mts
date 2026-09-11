import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import type { BloomFilterEntityType, BloomFilterProcessorJobs } from '../types.mts'
import {
  backfillBloomFilterJobOptions,
  rebuildBloomFilterJobOptions,
  rebuildEmbeddingBloomFilterJobOptions,
  QUEUE_NAME,
} from '../config.mts'
import { bloomFilters } from '../queues.mts'

const entityBackfillSchedules: [BloomFilterEntityType, string, string][] = [
  ['posts', '0 4 * * 0', 'bloom-filters-posts'],
  ['topics', '30 4 * * 0', 'bloom-filters-topics'],
  ['users', '0 5 * * 0', 'bloom-filters-users'],
  ['communities', '30 5 * * 0', 'bloom-filters-communities'],
  ['rss_feed_items', '0 6 * * 0', 'bloom-filters-rss-feed-items'],
]

export const scheduledJobManifest = defineScheduledJobManifest(QUEUE_NAME, [
  {
    schedulerId: 'rebuildUrlBlocklistBloomFilter',
    registration: 'sequential',
    repeat: { pattern: '0 3 * * 0' },
    template: {
      name: 'processRebuildBloomFilter' as BloomFilterProcessorJobs,
      data: { filter: 'url-blocklist' },
      opts: () => ({ attempts: 3, ...rebuildBloomFilterJobOptions({ filter: 'url-blocklist' }) }),
    },
    operatorSurfaces: [{ kind: 'valkey-bloom-filter', rebuildInput: 'url-blocklist' }],
  },
  {
    schedulerId: 'rebuildEmailBlocklistBloomFilter',
    registration: 'sequential',
    repeat: { pattern: '0 6 * * 0' },
    template: {
      name: 'processRebuildBloomFilter' as BloomFilterProcessorJobs,
      data: { filter: 'email-blocklist' },
      opts: () => ({ attempts: 3, ...rebuildBloomFilterJobOptions({ filter: 'email-blocklist' }) }),
    },
    operatorSurfaces: [{ kind: 'valkey-bloom-filter', rebuildInput: 'email-blocklist' }],
  },
  {
    schedulerId: 'rebuildEmbeddingBloomFilter',
    registration: 'sequential',
    repeat: { pattern: '0 7 * * 0' },
    template: {
      name: 'processRebuildEmbeddingBloomFilter' as BloomFilterProcessorJobs,
      data: {},
      opts: () => ({ attempts: 3, ...rebuildEmbeddingBloomFilterJobOptions() }),
    },
    operatorSurfaces: [{ kind: 'valkey-bloom-filter', rebuildInput: 'embedding' }],
  },
  {
    schedulerId: 'rebuildApiKeyBloomFilter',
    registration: 'sequential',
    repeat: { pattern: '0 8 * * 0' },
    template: {
      name: 'processRebuildBloomFilter' as BloomFilterProcessorJobs,
      data: { filter: 'api-keys' },
      opts: () => ({ attempts: 3, ...rebuildBloomFilterJobOptions({ filter: 'api-keys' }) }),
    },
    operatorSurfaces: [{ kind: 'valkey-bloom-filter', rebuildInput: 'api-keys' }],
  },
  ...entityBackfillSchedules.map(([entityType, pattern, backfillId]) => ({
    schedulerId: `backfillEntityCacheBloomFilter_${entityType}`,
    repeat: { pattern },
    template: {
      name: 'processBackfillBloomFilter' as BloomFilterProcessorJobs,
      data: { entityType },
      opts: () => ({ attempts: 3, ...backfillBloomFilterJobOptions({ entityType }) }),
    },
    operatorSurfaces: [
      { kind: 'backfill', backfillId: backfillId },
      ...((entityType === 'communities'
        ? []
        : [{ kind: 'valkey-bloom-filter', rebuildInput: 'entity-cache' }]) as
        | []
        | [{ kind: 'valkey-bloom-filter'; rebuildInput: string }]),
    ] as const,
  })),
])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(bloomFilters, scheduledJobManifest)
}
