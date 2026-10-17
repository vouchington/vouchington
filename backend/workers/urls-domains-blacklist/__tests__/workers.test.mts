import type { Job } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import { URLS_DOMAINS_BLACKLIST_CACHE_INVALIDATION_JOB } from '@queues/background/enqueues/urls-domains-blacklist-jobs'
import { enqueueHostnameCacheInvalidation } from '@services/entity-cache/hostname-invalidation-work'
import { beginTransaction, insertTestUrlHostname } from '@voucha/test-helpers'
import { getHostnameCacheInvalidationWorkForTest } from '@voucha/test-helpers/hostname-cache-invalidation'
import { urlsDomainsBlacklistHandlers } from '../workers.mts'

describe('urlsDomainsBlacklistHandlers', () => {
  it('drains durable hostname cache invalidation work for the sweep job', async () => {
    const hostnameId = await insertTestUrlHostname({
      hostname: `sweep-handler-${crypto.randomUUID()}.example.com`,
    })
    await using transaction = await beginTransaction()
    await enqueueHostnameCacheInvalidation(transaction, [hostnameId])
    await transaction.commit()
    expect(await getHostnameCacheInvalidationWorkForTest(hostnameId)).not.toBeNull()
    const handler = urlsDomainsBlacklistHandlers.find(
      candidate => candidate.job === URLS_DOMAINS_BLACKLIST_CACHE_INVALIDATION_JOB,
    )!

    await handler.handle({ data: {} } as Job)

    expect(await getHostnameCacheInvalidationWorkForTest(hostnameId)).toBeNull()
  })
})
