import type { Job } from 'glide-mq'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { wrapSingleProcessor } from '@data-stores/valkey-glide-mq/guarded-worker-processors'
import {
  BLOOM_FILTER_DEFAULTS,
  backfillBloomFilterJobOptions,
  backfillUserBookmarkBloomFilterJobOptions,
  blocklistBloomRebuildFollowUpJobId,
  bloomFilterRebuildJobId,
  QUEUE_NAME,
  rebuildBloomFilterJobOptions,
  rebuildEmbeddingBloomFilterJobOptions,
} from './config.mts'
import { enqueueRebuildBloomFilter, enqueueRebuildEmbeddingBloomFilter } from './enqueues.mts'
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

  it('delays blocklist rebuilds by the replica-lag safety margin', () => {
    expect(BLOOM_FILTER_DEFAULTS.replicaLagSafetyMarginMs).toBe(1_000)
    expect(rebuildBloomFilterJobOptions({ filter: 'url-blocklist' }).delay).toBe(
      BLOOM_FILTER_DEFAULTS.replicaLagSafetyMarginMs,
    )
    expect(rebuildBloomFilterJobOptions({ filter: 'email-blocklist' }).delay).toBe(
      BLOOM_FILTER_DEFAULTS.replicaLagSafetyMarginMs,
    )
    expect(rebuildBloomFilterJobOptions({ filter: 'embedding' })).not.toHaveProperty('delay')
    expect(rebuildBloomFilterJobOptions({ filter: 'api-keys' })).not.toHaveProperty('delay')
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

const emailBlocklist = { filter: 'email-blocklist' } as const
const emailPrimaryJobId = bloomFilterRebuildJobId(emailBlocklist.filter)
const emailFollowUpJobId = blocklistBloomRebuildFollowUpJobId(emailBlocklist.filter)

describe('blocklist rebuild admission', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retries the primary id after the follow-up cannot move', async () => {
    let adds = 0
    vi.spyOn(bloomFilters, 'add').mockImplementation(async () => {
      adds += 1
      return (adds === 3 ? { id: emailPrimaryJobId } : null) as never
    })
    vi.spyOn(bloomFilters, 'getJob').mockResolvedValue(unchangeableJob() as never)

    await expect(enqueueRebuildBloomFilter(emailBlocklist)).resolves.toBeNull()
    expect(adds).toBe(3)
  })

  it('throws when every blocklist rebuild id is refused', async () => {
    vi.spyOn(bloomFilters, 'add').mockResolvedValue(null as never)
    vi.spyOn(bloomFilters, 'getJob').mockResolvedValue(unchangeableJob() as never)

    await expect(enqueueRebuildBloomFilter(emailBlocklist)).rejects.toThrow(
      'Blocklist bloom rebuild for email-blocklist was not admitted',
    )
  })

  it('rethrows a delay change that is not an admission refusal', async () => {
    const failure = new Error('connection reset')
    vi.spyOn(bloomFilters, 'add').mockResolvedValue(null as never)
    vi.spyOn(bloomFilters, 'getJob').mockResolvedValue({
      changeDelay: async () => {
        throw failure
      },
    } as never)

    await expect(enqueueRebuildBloomFilter(emailBlocklist)).rejects.toBe(failure)
  })

  it('skips the rebuild id that is already running and admits the follow-up', async () => {
    const existing = await bloomFilters.getJob(emailFollowUpJobId)
    const run = wrapSingleProcessor(
      QUEUE_NAME,
      async () => {
        await enqueueRebuildBloomFilter(emailBlocklist)
      },
      {},
    )
    try {
      await run({ id: emailPrimaryJobId, opts: {} } as Job)
      expect(await bloomFilters.getJob(emailFollowUpJobId)).toBeTruthy()
    } finally {
      if (!existing) await (await bloomFilters.getJob(emailFollowUpJobId))?.remove()
    }
  })
})

function unchangeableJob(): { changeDelay: () => Promise<void> } {
  return {
    changeDelay: async () => {
      throw new Error('Cannot change delay: invalid_state')
    },
  }
}
