import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  backfillBloomFilterJobOptions,
  backfillUserBookmarkBloomFilterJobOptions,
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

  it('releases stable rebuild identities on terminal outcomes and preserves ordering', () => {
    expect(rebuildBloomFilterJobOptions({ filter: 'url-blocklist' })).toMatchObject({
      ordering: { key: 'url-blocklist', concurrency: 1 },
      jobId: 'bloomFilterRebuild__url-blocklist',
      removeOnComplete: true,
      removeOnFail: true,
    })
    expect(rebuildBloomFilterJobOptions({ filter: 'email-blocklist' })).toMatchObject({
      ordering: { key: 'email-blocklist', concurrency: 1 },
      jobId: 'bloomFilterRebuild__email-blocklist',
      removeOnComplete: true,
      removeOnFail: true,
    })
    expect(rebuildBloomFilterJobOptions({ filter: 'embedding' })).toMatchObject({
      ordering: { key: 'openai-text-embedding-3-small', concurrency: 1 },
      jobId: 'bloomFilterRebuild__embedding',
      removeOnComplete: true,
      removeOnFail: true,
    })
    expect(rebuildBloomFilterJobOptions({ filter: 'api-keys' })).toMatchObject({
      ordering: { key: 'api-keys', concurrency: 1 },
      jobId: 'bloomFilterRebuild__api-keys',
      removeOnComplete: true,
      removeOnFail: true,
    })
  })

  it('shares one rebuild identity across embedding entry points', () => {
    expect(rebuildEmbeddingBloomFilterJobOptions()).toEqual(
      rebuildBloomFilterJobOptions({ filter: 'embedding' }),
    )
  })

  it('enqueues the same embedding rebuild job used by admin and failure recovery', async () => {
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
      jobId: 'bloomFilterRebuild__rss_feed_items',
      removeOnComplete: true,
      removeOnFail: true,
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

  it('has no scheduled Bloom rebuilds', () => {
    expect(scheduledJobManifest.jobs).toEqual([])
  })
})
