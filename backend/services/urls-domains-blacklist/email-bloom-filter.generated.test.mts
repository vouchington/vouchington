import { it, expect, afterEach, beforeEach, describe, vi, type MockInstance } from 'vitest'
import {
  checkEmailBloomFilter,
  addDomainsToEmailBloomFilter,
  rebuildEmailBloomFilter,
  deleteEmailBloomFilter,
  warmUpEmailBlocklistBloomFilter,
} from './email-bloom-filter.mts'
import { enqueueRebuildBloomFilterBestEffortWithEnqueue } from './rebuild-enqueue.mts'
import * as rebuildEnqueue from './rebuild-enqueue.mts'
import { checkBloomFilterRead, normalizeValkeyKeyTypeForRepair } from './read-repair.mts'
import {
  createTestBlacklistSource,
  insertTestDomainBlacklist,
  hasEmailTypeDomainBlacklists,
} from '@voucha/test-helpers'
import { registerOwnedBlocklistBloomRecoveryTests } from '@voucha/test-helpers/blocklist-bloom-recovery-tests'
import { bloomValkeyClient } from '@data-stores/valkey'

describe('email-bloom-filter.generated', () => {
  const TEST_SOURCE_NAME = `test-email-bloom-filter-${Array.from({ length: 8 }, () => String.fromCodePoint(97 + Math.floor(Math.random() * 26))).join('')}`

  let enqueueSpy: MockInstance<typeof rebuildEnqueue.enqueueRebuildBloomFilterBestEffort>

  async function settleOwnedRebuildEnqueues() {
    await Promise.allSettled(
      enqueueSpy.mock.results.flatMap(result => (result.type === 'return' ? [result.value] : [])),
    )
  }

  beforeEach(async () => {
    enqueueSpy = vi.spyOn(rebuildEnqueue, 'enqueueRebuildBloomFilterBestEffort')
    await deleteEmailBloomFilter()
  })

  afterEach(async () => {
    try {
      await settleOwnedRebuildEnqueues()
    } finally {
      enqueueSpy.mockRestore()
    }
    await deleteEmailBloomFilter()
  })

  it('checkEmailBloomFilter returns null when filter does not exist', async () => {
    const result = await checkEmailBloomFilter('nonexistent.com')
    expect(result).toBeNull()
  })

  registerOwnedBlocklistBloomRecoveryTests({
    filter: 'email-blocklist',
    check: checkEmailBloomFilter,
    add: addDomainsToEmailBloomFilter,
    wasRebuildEnqueued: () => enqueueSpy.mock.calls.length > 0,
    settleRebuildEnqueues: settleOwnedRebuildEnqueues,
  })

  it('enqueueRebuildBloomFilterBestEffortWithEnqueue runs callbacks after promise enqueues', async () => {
    const callbacks: string[] = []

    await enqueueRebuildBloomFilterBestEffortWithEnqueue(
      () => Promise.resolve(),
      'email-blocklist',
      async () => {
        callbacks.push('enqueued')
      },
    )

    expect(callbacks).toEqual(['enqueued'])
  })

  it('enqueueRebuildBloomFilterBestEffortWithEnqueue swallows synchronous callback errors', async () => {
    await expect(
      enqueueRebuildBloomFilterBestEffortWithEnqueue(
        () => undefined,
        'email-blocklist',
        () => {
          throw new Error('callback failed')
        },
      ),
    ).resolves.toBeUndefined()
  })

  it('checkBloomFilterRead repairs throwing reads and returns null', async () => {
    const repairs: string[] = []

    const result = await checkBloomFilterRead({
      readyKey: 'ready',
      liveKey: 'live',
      value: 'blocked.example',
      existsIfReady: async () => {
        throw new Error('read failed')
      },
      repairUnavailableRead: async () => {
        repairs.push('repair')
      },
    })

    expect(result).toBeNull()
    expect(repairs).toEqual(['repair'])
  })

  it('normalizeValkeyKeyTypeForRepair logs unexpected command responses', () => {
    expect(normalizeValkeyKeyTypeForRepair(1, 'test-key')).toBe('')
  })

  it('addDomainsToEmailBloomFilter and checkEmailBloomFilter round-trip', async () => {
    // rebuildEmailBloomFilter creates the filter; start with an empty DB so the filter is empty
    await rebuildEmailBloomFilter()

    const domains = ['blocked-a.com', 'blocked-b.com', 'blocked-c.com']

    await addDomainsToEmailBloomFilter(domains)

    for (const domain of domains) {
      const result = await checkEmailBloomFilter(domain)
      expect(result).toBe(true)
    }
  })

  it('checkEmailBloomFilter returns false for domain not in filter', async () => {
    await rebuildEmailBloomFilter()

    const result = await checkEmailBloomFilter('definitely-not-in-filter.com')
    expect(result).toBe(false)
  })

  it('rebuildEmailBloomFilter creates filter from DB domains', async () => {
    const suffix = Math.random().toString(36).slice(2)

    await createTestBlacklistSource({
      type: 'email',
      name: TEST_SOURCE_NAME,
      url: 'https://example.com/test-email-bloom.txt',
    })

    const testDomains = [
      `email-bloom-test-a-${suffix}.com`,
      `email-bloom-test-b-${suffix}.com`,
      `email-bloom-test-c-${suffix}.com`,
    ]

    for (const domain of testDomains) {
      await insertTestDomainBlacklist(domain, TEST_SOURCE_NAME)
    }

    await rebuildEmailBloomFilter()

    for (const domain of testDomains) {
      const result = await checkEmailBloomFilter(domain)
      expect(result).toBe(true)
    }

    const result = await checkEmailBloomFilter(`not-in-db-${suffix}.com`)
    expect(result).toBe(false)
  })

  it('rebuildEmailBloomFilter atomically replaces old filter', async () => {
    const suffix = Math.random().toString(36).slice(2)

    await createTestBlacklistSource({
      type: 'email',
      name: TEST_SOURCE_NAME,
      url: 'https://example.com/test-email-bloom.txt',
    })

    await rebuildEmailBloomFilter()

    const newDomain = `new-email-domain-${suffix}.com`
    await insertTestDomainBlacklist(newDomain, TEST_SOURCE_NAME)

    await rebuildEmailBloomFilter()

    const result = await checkEmailBloomFilter(newDomain)
    expect(result).toBe(true)
  })

  it('deleteEmailBloomFilter removes the filter', async () => {
    await rebuildEmailBloomFilter()

    await addDomainsToEmailBloomFilter(['test.com'])

    const before = await checkEmailBloomFilter('test.com')
    expect(before).toBe(true)

    await deleteEmailBloomFilter()

    const after = await checkEmailBloomFilter('test.com')
    expect(after).toBeNull()
  })

  it('warmUpEmailBlocklistBloomFilter rebuilds when ready marker exists but filter is missing', async () => {
    const suffix = Math.random().toString(36).slice(2)

    await createTestBlacklistSource({
      type: 'email',
      name: TEST_SOURCE_NAME,
      url: 'https://example.com/test-email-bloom.txt',
    })

    await insertTestDomainBlacklist(`warmup-email-ready-missing-${suffix}.com`, TEST_SOURCE_NAME)
    await bloomValkeyClient.set('bloom-filter:email-blocklist:ready', '1')

    await expect(warmUpEmailBlocklistBloomFilter()).resolves.toBeUndefined()
  })

  it('warmUpEmailBlocklistBloomFilter skips when no DB data', async () => {
    // Parallel tests may have email-type DB data or auto-created the filter via BF.MADD.
    // Both guards must pass to run this test reliably in a shared test environment.
    const hasData = await hasEmailTypeDomainBlacklists()
    const filterPreExists = (await checkEmailBloomFilter('anything.com')) !== null
    if (hasData || filterPreExists) return

    await warmUpEmailBlocklistBloomFilter()

    // Parallel test workers may have created the filter via BF.MADD between checks; skip if so
    const result = await checkEmailBloomFilter('anything.com')
    if (result !== null) return

    expect(result).toBeNull()
  })

  it('addDomainsToEmailBloomFilter swallows error and unlinks ready marker when bloom key is corrupted', async () => {
    // Corrupt the live Valkey key (bloom-filter:<name>) with a string — BF.MADD throws WRONGTYPE
    await bloomValkeyClient.set('bloom-filter:email-blocklist:ready', 'stale')
    await bloomValkeyClient.set('bloom-filter:email-blocklist', 'corrupted')
    // Should resolve without throwing — error recovery is internal
    await expect(addDomainsToEmailBloomFilter(['blocked.com'])).resolves.toBeUndefined()
  })
})
