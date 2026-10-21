import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  getTestPostgresBackendProcessId,
  insertTestUrlHostname,
  waitForTestPostgresLockWaiter,
} from '@voucha/test-helpers'
import { getOrCreateCrawlerForHostname, getOrCreateCrawlersForHostnames } from './get-or-create.mts'

describe('batched crawler creation', () => {
  it('reuses a crawler committed while an overlapping batch waits', async () => {
    const hostnameId = await insertTestUrlHostname({
      hostname: `crawler-batch-${crypto.randomUUID()}.test`,
    })
    await using holder = await beginTransaction()
    const existing = await getOrCreateCrawlerForHostname(null, hostnameId, { query: holder })
    const pid = await getTestPostgresBackendProcessId(holder)
    const waiting = getOrCreateCrawlersForHostnames(null, [hostnameId.toUpperCase(), hostnameId])
    try {
      await waitForTestPostgresLockWaiter(pid, 'getOrCreateCrawlersForHostnames:lock')
    } finally {
      await holder.commit()
    }
    const crawlers = await waiting
    expect(crawlers.size).toBe(1)
    expect(crawlers.get(hostnameId)?.id).toBe(existing.id)
  })
})
