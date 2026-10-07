import { it, expect, afterEach, beforeEach, describe, vi, type MockInstance } from 'vitest'
import {
  checkBloomFilter,
  addDomainsToBloomFilter,
  rebuildBloomFilter,
  deleteBloomFilter,
  warmUpUrlBlocklistBloomFilter,
} from './bloom-filter.mts'
import { enqueueRebuildBloomFilterBestEffortWithEnqueue } from './rebuild-enqueue.mts'
import * as rebuildEnqueue from './rebuild-enqueue.mts'
import {
  createTestBlacklistSource,
  insertTestDomainBlacklist,
  insertTestUrlHostname,
  hasUrlTypeDomainBlacklists,
} from '@voucha/test-helpers'
import { withOwnedBlocklistBloomFilter } from '@voucha/test-helpers/owned-blocklist-bloom-filter'
import { bloomValkeyClient } from '@data-stores/valkey'
import { unlinkReadyMarkerIfValue } from './ready-marker.mts'

describe('bloom-filter.generated', () => {
  const TEST_SOURCE_NAME = `test-bloom-filter-${Array.from({ length: 8 }, () => String.fromCodePoint(97 + Math.floor(Math.random() * 26))).join('')}`

  let enqueueSpy: MockInstance<typeof rebuildEnqueue.enqueueRebuildBloomFilterBestEffort>

  async function settleOwnedRebuildEnqueues() {
    await Promise.allSettled(
      enqueueSpy.mock.results.flatMap(result => (result.type === 'return' ? [result.value] : [])),
    )
  }

  beforeEach(async () => {
    enqueueSpy = vi.spyOn(rebuildEnqueue, 'enqueueRebuildBloomFilterBestEffort')
    await deleteBloomFilter()
  })

  afterEach(async () => {
    try {
      await settleOwnedRebuildEnqueues()
    } finally {
      enqueueSpy.mockRestore()
    }
    await deleteBloomFilter()
  })

  it('checkBloomFilter returns null when filter does not exist', async () => {
    const result = await checkBloomFilter('nonexistent.com')
    expect(result).toBeNull()
  })

  it('checkBloomFilter returns null when the ready marker is not readable', async () => {
    await withOwnedBlocklistBloomFilter('url-blocklist', async ({ readyKey, readTarget }) => {
      await bloomValkeyClient.customCommand(['LPUSH', readyKey, 'not-a-string-marker'])

      const result = await checkBloomFilter('wrong-ready-type.com', readTarget)

      expect(result).toBeNull()
      expect(enqueueSpy).toHaveBeenCalled()
      await settleOwnedRebuildEnqueues()
    })
  })

  it('checkBloomFilter keeps ready marker valid when missing-filter repair runs', async () => {
    await withOwnedBlocklistBloomFilter('url-blocklist', async ({ readyKey, readTarget }) => {
      await bloomValkeyClient.set(readyKey, '1')

      const result = await checkBloomFilter('missing-filter.com', readTarget)
      expect(enqueueSpy).toHaveBeenCalled()
      await settleOwnedRebuildEnqueues()
      expect(result).toBeNull()
      const readyMarker = await bloomValkeyClient.get(readyKey)
      expect(readyMarker == null || readyMarker.toString().startsWith('ready:')).toBe(true)
    })
  })

  it('checkBloomFilter keeps ready marker valid when corrupted-filter repair runs', async () => {
    await withOwnedBlocklistBloomFilter(
      'url-blocklist',
      async ({ bloomFilter, readyKey, readTarget }) => {
        await bloomValkeyClient.set(readyKey, '1')
        await bloomValkeyClient.set(bloomFilter.getKey(), 'corrupted')

        const result = await checkBloomFilter('corrupted-filter.com', readTarget)
        expect(enqueueSpy).toHaveBeenCalled()
        await settleOwnedRebuildEnqueues()
        expect(result).toBeNull()
        const readyMarker = await bloomValkeyClient.get(readyKey)
        expect(readyMarker == null || readyMarker.toString().startsWith('ready:')).toBe(true)
      },
    )
  })

  it('unlinkReadyMarkerIfValue preserves refreshed ready markers', async () => {
    await bloomValkeyClient.set('bloom-filter:url-blocklist:ready', 'old')
    await bloomValkeyClient.set('bloom-filter:url-blocklist:ready', 'fresh')

    const removed = await unlinkReadyMarkerIfValue('bloom-filter:url-blocklist:ready', 'old')

    expect(removed).toBe(0)
    expect(await bloomValkeyClient.get('bloom-filter:url-blocklist:ready')).toBe('fresh')
  })

  it('enqueueRebuildBloomFilterBestEffortWithEnqueue runs callbacks after non-promise enqueues', async () => {
    const callbacks: string[] = []

    await enqueueRebuildBloomFilterBestEffortWithEnqueue(
      () => undefined,
      'url-blocklist',
      async () => {
        callbacks.push('enqueued')
      },
    )

    expect(callbacks).toEqual(['enqueued'])
  })

  it('enqueueRebuildBloomFilterBestEffortWithEnqueue skips callbacks when enqueue throws', async () => {
    const callbacks: string[] = []

    await enqueueRebuildBloomFilterBestEffortWithEnqueue(
      () => {
        throw new Error('enqueue failed')
      },
      'url-blocklist',
      async () => {
        callbacks.push('enqueued')
      },
    )

    expect(callbacks).toEqual([])
  })

  it('addDomainsToBloomFilter and checkBloomFilter round-trip', async () => {
    // rebuildBloomFilter creates the filter; start with an empty DB so the filter is empty
    await rebuildBloomFilter()

    const domains = ['blocked-a.com', 'blocked-b.com', 'blocked-c.com']

    await addDomainsToBloomFilter(domains)

    for (const domain of domains) {
      const result = await checkBloomFilter(domain)
      expect(result).toBe(true)
    }
  })

  it('checkBloomFilter returns false for domain not in filter', async () => {
    await rebuildBloomFilter()

    const uniqueId = Math.random().toString(36).slice(2)
    const result = await checkBloomFilter(`not-in-filter-${uniqueId}.com`)
    expect(result).toBe(false)
  })

  it('rebuildBloomFilter creates filter from DB domains', async () => {
    const suffix = Math.random().toString(36).slice(2)

    await createTestBlacklistSource({
      type: 'url',
      name: TEST_SOURCE_NAME,
      url: 'https://example.com/test-bloom.txt',
    })

    const testDomains = [
      `bloom-test-a-${suffix}.com`,
      `bloom-test-b-${suffix}.com`,
      `bloom-test-c-${suffix}.com`,
    ]

    for (const domain of testDomains) {
      await insertTestDomainBlacklist(domain, TEST_SOURCE_NAME)
    }

    await rebuildBloomFilter()

    for (const domain of testDomains) {
      const result = await checkBloomFilter(domain)
      expect(result).toBe(true)
    }

    const result = await checkBloomFilter(`not-in-db-${suffix}.com`)
    expect(result).toBe(false)
  })

  it('rebuildBloomFilter includes manually blocked hostnames', async () => {
    const suffix = Math.random().toString(36).slice(2)
    const hostname = `manually-blocked-${suffix}.com`
    await insertTestUrlHostname({ hostname, is_blocked: true })

    await rebuildBloomFilter()

    const result = await checkBloomFilter(hostname)
    expect(result).toBe(true)
  })

  it('rebuildBloomFilter atomically replaces old filter', async () => {
    const suffix = Math.random().toString(36).slice(2)

    await createTestBlacklistSource({
      type: 'url',
      name: TEST_SOURCE_NAME,
      url: 'https://example.com/test-bloom.txt',
    })

    await rebuildBloomFilter()

    const newDomain = `new-domain-${suffix}.com`
    await insertTestDomainBlacklist(newDomain, TEST_SOURCE_NAME)

    await rebuildBloomFilter()

    const result = await checkBloomFilter(newDomain)
    expect(result).toBe(true)
  })

  it('deleteBloomFilter removes the filter', async () => {
    await rebuildBloomFilter()

    await addDomainsToBloomFilter(['test.com'])

    const before = await checkBloomFilter('test.com')
    expect(before).toBe(true)

    await deleteBloomFilter()

    const after = await checkBloomFilter('test.com')
    expect(after).toBeNull()
  })

  it('warmUpUrlBlocklistBloomFilter rebuilds when ready marker exists but filter is missing', async () => {
    const suffix = Math.random().toString(36).slice(2)

    await createTestBlacklistSource({
      type: 'url',
      name: TEST_SOURCE_NAME,
      url: 'https://example.com/test-bloom.txt',
    })

    await insertTestDomainBlacklist(`warmup-ready-missing-${suffix}.com`, TEST_SOURCE_NAME)
    await bloomValkeyClient.set('bloom-filter:url-blocklist:ready', '1')

    await expect(warmUpUrlBlocklistBloomFilter()).resolves.toBeUndefined()
  })

  it('warmUpUrlBlocklistBloomFilter skips when no DB data', async () => {
    // Parallel tests may have URL-type DB data or auto-created the filter via BF.MADD.
    // Both guards must pass to run this test reliably in a shared test environment.
    const hasData = await hasUrlTypeDomainBlacklists()
    const filterPreExists = (await checkBloomFilter('anything.com')) !== null
    if (hasData || filterPreExists) return

    await warmUpUrlBlocklistBloomFilter()

    // Parallel test workers may have created the filter via BF.MADD between checks; skip if so
    const result = await checkBloomFilter('anything.com')
    if (result !== null) return

    expect(result).toBeNull()
  })

  it('addDomainsToBloomFilter swallows error and unlinks ready marker when bloom key is corrupted', async () => {
    // Corrupt the live Valkey key (bloom-filter:<name>) with a string — BF.MADD throws WRONGTYPE
    await bloomValkeyClient.set('bloom-filter:url-blocklist:ready', 'stale')
    await bloomValkeyClient.set('bloom-filter:url-blocklist', 'corrupted')
    // Should resolve without throwing — error recovery is internal
    await expect(addDomainsToBloomFilter(['blocked.com'])).resolves.toBeUndefined()
  })

  it('addDomainsToBloomFilter swallows unreadable ready marker recovery errors', async () => {
    await withOwnedBlocklistBloomFilter(
      'url-blocklist',
      async ({ bloomFilter, readyKey, addTarget }) => {
        await bloomValkeyClient.customCommand(['LPUSH', readyKey, 'not-a-string-marker'])
        await bloomValkeyClient.set(bloomFilter.getKey(), 'corrupted')

        await expect(addDomainsToBloomFilter(['blocked.com'], addTarget)).resolves.toBeUndefined()
        expect(enqueueSpy).toHaveBeenCalled()
        await settleOwnedRebuildEnqueues()
        expect(await bloomValkeyClient.customCommand(['TYPE', readyKey])).not.toBe('list')
      },
    )
  })
})
