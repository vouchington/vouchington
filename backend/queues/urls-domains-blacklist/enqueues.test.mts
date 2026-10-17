import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  URLS_DOMAINS_BLACKLIST_CACHE_INVALIDATION_JOB,
  URLS_DOMAINS_BLACKLIST_DISPATCHER_JOB,
  URLS_DOMAINS_BLACKLIST_SOURCE_SYNC_JOB,
} from '@queues/background/enqueues/urls-domains-blacklist-jobs'
import {
  enqueueBlacklistDispatcher,
  enqueueBulkSourceSyncs,
  enqueueHostnameCacheInvalidationSweep,
  enqueueSourceSync,
} from './enqueues.mts'
import { urlsDomainsBlacklist } from './queues.mts'

const ONE_HOUR_MS = 60 * 60 * 1000
const findSyncJobs = (sourceId: string) =>
  urlsDomainsBlacklist.searchJobs({
    name: URLS_DOMAINS_BLACKLIST_SOURCE_SYNC_JOB.name,
    data: { sourceId },
  })

describe('urls-domains-blacklist enqueues', () => {
  it('enqueues the dispatcher in its namespaced lane at dispatcher priority', async () => {
    const job = await enqueueBlacklistDispatcher()

    expect(job).toMatchObject({
      name: URLS_DOMAINS_BLACKLIST_DISPATCHER_JOB.name,
      opts: {
        priority: 100,
        ordering: { key: 'urls-domains-blacklist:dispatcher', concurrency: 1 },
      },
    })
  })

  it('enqueues the hostname cache-invalidation sweep in its own namespaced lane', async () => {
    const job = await enqueueHostnameCacheInvalidationSweep()

    expect(job).toMatchObject({
      name: URLS_DOMAINS_BLACKLIST_CACHE_INVALIDATION_JOB.name,
      opts: {
        priority: 100,
        ordering: { key: 'urls-domains-blacklist:cache-invalidation', concurrency: 1 },
      },
    })
  })

  it('enqueues a delayed source sync in the sync lane', async () => {
    const sourceId = randomUUID()

    await enqueueSourceSync({ sourceId }, 60_000)

    const [job] = await findSyncJobs(sourceId)
    expect(job).toMatchObject({
      name: 'urls-domains-blacklist.processBlacklistSourceSync',
      data: { sourceId },
      opts: {
        priority: 10,
        delay: 60_000,
        ordering: { key: 'urls-domains-blacklist', concurrency: 5 },
      },
    })
  })

  it('staggers bulk source syncs an hour apart and ignores an empty list', async () => {
    expect(await enqueueBulkSourceSyncs([])).toBeUndefined()
    const sourceIds = [randomUUID(), randomUUID(), randomUUID()]

    await enqueueBulkSourceSyncs(sourceIds.map(sourceId => ({ sourceId })))

    const delays = await Promise.all(
      sourceIds.map(async sourceId => (await findSyncJobs(sourceId))[0]?.opts.delay),
    )
    expect(delays).toEqual([0, ONE_HOUR_MS, 2 * ONE_HOUR_MS])
  })

  it('carries a priority through the dispatcher, a source sync and a bulk of source syncs', async () => {
    const priority = 7
    const sourceId = randomUUID()
    const bulkSourceId = randomUUID()

    const dispatcher = await enqueueBlacklistDispatcher(priority)
    await enqueueSourceSync({ sourceId }, undefined, priority)
    await enqueueBulkSourceSyncs([{ sourceId: bulkSourceId }], priority)

    expect(dispatcher).toMatchObject({ opts: { priority } })
    expect((await findSyncJobs(sourceId))[0]?.opts.priority).toBe(priority)
    expect((await findSyncJobs(bulkSourceId))[0]?.opts.priority).toBe(priority)
  })
})
