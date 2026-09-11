import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  backfillBloomFilterJobOptions,
  backfillUserBookmarkBloomFilterJobOptions,
  populateBloomFilterJobOptions,
  rebuildBloomFilterJobOptions,
  rebuildEmbeddingBloomFilterJobOptions,
} from './config.mts'
import { enqueueRebuildEmbeddingBloomFilter } from './enqueues.mts'
import { scheduledJobManifest } from './enqueues/schedules.mts'
import { bloomFilters } from './queues.mts'

describe('enqueues.generated', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses simple deduplication and ordering for physical bloom filter rebuild jobs', () => {
    expect(rebuildBloomFilterJobOptions({ filter: 'url-blocklist' })).toMatchObject({
      ordering: { key: 'url-blocklist', concurrency: 1 },
      deduplication: { id: 'processRebuildBloomFilter__url-blocklist', mode: 'simple' },
    })
    expect(rebuildBloomFilterJobOptions({ filter: 'email-blocklist' })).toMatchObject({
      ordering: { key: 'email-blocklist', concurrency: 1 },
      deduplication: { id: 'processRebuildBloomFilter__email-blocklist', mode: 'simple' },
    })
    expect(rebuildBloomFilterJobOptions({ filter: 'embedding' })).toMatchObject({
      ordering: { key: 'openai-text-embedding-3-small', concurrency: 1 },
      deduplication: { id: 'bloom-filter__openai-text-embedding-3-small', mode: 'simple' },
    })
    expect(rebuildBloomFilterJobOptions({ filter: 'api-keys' })).toMatchObject({
      ordering: { key: 'api-keys', concurrency: 1 },
      deduplication: { id: 'processRebuildBloomFilter__api-keys', mode: 'simple' },
    })
  })

  it('uses the same simple deduplication id for embedding populate and rebuild', () => {
    const populate = populateBloomFilterJobOptions()
    const rebuild = rebuildEmbeddingBloomFilterJobOptions()

    expect(populate).toMatchObject({
      ordering: { key: 'openai-text-embedding-3-small', concurrency: 1 },
      deduplication: { id: 'bloom-filter__openai-text-embedding-3-small', mode: 'simple' },
    })
    expect(rebuild).toMatchObject({
      ordering: { key: 'openai-text-embedding-3-small', concurrency: 1 },
      deduplication: { id: 'bloom-filter__openai-text-embedding-3-small', mode: 'simple' },
    })
  })

  it('enqueues the same embedding rebuild job used by the scheduler', async () => {
    const add = vi.spyOn(bloomFilters, 'add').mockResolvedValue(undefined as never)

    await enqueueRebuildEmbeddingBloomFilter()

    expect(add).toHaveBeenCalledExactlyOnceWith(
      'processRebuildEmbeddingBloomFilter',
      {},
      expect.objectContaining(rebuildEmbeddingBloomFilterJobOptions()),
    )
  })

  it('uses simple deduplication and ordering for entity-cache and bookmark backfills', () => {
    expect(backfillBloomFilterJobOptions({ entityType: 'rss_feed_items' })).toMatchObject({
      ordering: { key: 'entity-cache:rss_feed_items', concurrency: 1 },
      deduplication: { id: 'processBackfillBloomFilter__rss_feed_items', mode: 'simple' },
    })
    expect(
      backfillUserBookmarkBloomFilterJobOptions({
        userId: '00000000-0000-7000-8000-000000000001',
      }),
    ).toMatchObject({
      ordering: { key: 'bookmark:00000000-0000-7000-8000-000000000001', concurrency: 1 },
      deduplication: {
        id: 'processBackfillUserBookmarkBloomFilter__00000000-0000-7000-8000-000000000001',
        mode: 'simple',
      },
    })
  })

  it('keeps the grouped entity-cache admin rebuild on supported entity schedules only', () => {
    const entityJobs = scheduledJobManifest.jobs.filter(job =>
      job.schedulerId.startsWith('backfillEntityCacheBloomFilter_'),
    )

    expect(
      entityJobs.map(job => ({
        entityType: (job.template.data as { entityType: string }).entityType,
        valkeyRebuild: job.operatorSurfaces.some(surface =>
          surface.kind === 'valkey-bloom-filter' ? surface.rebuildInput === 'entity-cache' : false,
        ),
      })),
    ).toEqual([
      { entityType: 'posts', valkeyRebuild: true },
      { entityType: 'topics', valkeyRebuild: true },
      { entityType: 'users', valkeyRebuild: true },
      { entityType: 'communities', valkeyRebuild: false },
      { entityType: 'rss_feed_items', valkeyRebuild: true },
    ])
  })
})
