import { describe, expect, it } from 'vitest'
import { beginTransaction, insertTestUrlHostname } from '@voucha/test-helpers'
import { createTestPostgresLockWaiter } from '@voucha/test-helpers/postgres-lock-waiter'
import { getOrCreateCrawlerForHostname, getOrCreateCrawlersForHostnames } from './get-or-create.mts'

describe('batched crawler creation', () => {
  it('reuses a crawler committed while an overlapping batch waits', async () => {
    const hostnameId = await insertTestUrlHostname({
      hostname: `crawler-batch-${crypto.randomUUID()}.test`,
    })
    await using holder = await beginTransaction()
    const existing = await getOrCreateCrawlerForHostname(null, hostnameId, { query: holder })
    await using waiter = await createTestPostgresLockWaiter({
      holder,
      lock: { kind: 'advisory32', key: hostnameId },
      selected: {
        marker: '/* getOrCreateCrawlersForHostnames:lock */',
        binding: { index: 0, value: [hostnameId] },
      },
    })
    const waiting = getOrCreateCrawlersForHostnames(null, [hostnameId.toUpperCase(), hostnameId], {
      query: waiter.query,
    })
    await waiter.waitForLock(waiting)
    await holder.commit()
    const crawlers = await waiting
    await waiter.query.commit()
    expect(crawlers.size).toBe(1)
    expect(crawlers.get(hostnameId)?.id).toBe(existing.id)
  })
})
