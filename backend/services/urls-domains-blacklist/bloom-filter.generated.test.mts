import { randomUUID } from 'node:crypto'
import { it, expect, afterEach, beforeEach, describe, vi, type MockInstance } from 'vitest'
import { addDomainsToBloomFilter } from './bloom-filter.mts'
import { enqueueRebuildBloomFilterBestEffortWithEnqueue } from './rebuild-enqueue.mts'
import * as rebuildEnqueue from './rebuild-enqueue.mts'
import { bloomValkeyClient } from '@data-stores/valkey'
import { registerOwnedBlocklistBloomRecoveryTests } from '@voucha/test-helpers/blocklist-bloom-recovery-tests'
import { unlinkReadyMarkerIfValue } from './ready-marker.mts'
import { checkBloomFilterRead } from './read-repair.mts'

describe('bloom-filter.generated', () => {
  let enqueueSpy: MockInstance<typeof rebuildEnqueue.enqueueRebuildBloomFilterBestEffort>

  async function settleOwnedRebuildEnqueues() {
    await Promise.allSettled(
      enqueueSpy.mock.results.flatMap(result => (result.type === 'return' ? [result.value] : [])),
    )
  }

  beforeEach(() => {
    enqueueSpy = vi.spyOn(rebuildEnqueue, 'enqueueRebuildBloomFilterBestEffort')
  })

  afterEach(async () => {
    try {
      await settleOwnedRebuildEnqueues()
    } finally {
      enqueueSpy.mockRestore()
    }
  })

  registerOwnedBlocklistBloomRecoveryTests({
    filter: 'url-blocklist',
    check: (domain, target) => checkBloomFilterRead({ ...target, value: domain }),
    add: addDomainsToBloomFilter,
    wasRebuildEnqueued: () => enqueueSpy.mock.calls.length > 0,
    settleRebuildEnqueues: settleOwnedRebuildEnqueues,
  })

  it('unlinkReadyMarkerIfValue preserves refreshed ready markers', async () => {
    const key = `bloom-filter:ready-marker-test:${randomUUID()}`
    try {
      await bloomValkeyClient.set(key, 'old')
      await bloomValkeyClient.set(key, 'fresh')

      await expect(unlinkReadyMarkerIfValue(key, 'old')).resolves.toBe(0)
      await expect(bloomValkeyClient.get(key)).resolves.toBe('fresh')

      await expect(unlinkReadyMarkerIfValue(key, 'fresh')).resolves.toBe(1)
      await expect(bloomValkeyClient.get(key)).resolves.toBeNull()
    } finally {
      await bloomValkeyClient.unlink([key])
    }
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
})
