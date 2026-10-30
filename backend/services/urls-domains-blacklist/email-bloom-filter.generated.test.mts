import { it, expect, afterEach, beforeEach, describe, vi, type MockInstance } from 'vitest'
import { bloomValkeyClient } from '@data-stores/valkey/clients'
import { registerOwnedBlocklistBloomRecoveryTests } from '@voucha/test-helpers/blocklist-bloom-recovery-tests'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { checkEmailBloomFilter, addDomainsToEmailBloomFilter } from './email-bloom-filter.mts'
import { checkBloomFilterRead } from './read-repair.mts'
import { enqueueRebuildBloomFilterBestEffortWithEnqueue } from './rebuild-enqueue.mts'
import * as rebuildEnqueue from './rebuild-enqueue.mts'

describe('email-bloom-filter.generated', () => {
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

  it('logs an unexpected Valkey TYPE response and leaves the filter readable', async () => {
    const repairs: string[] = []
    const reportedAt = sentryCaptureExceptionMock.mock.calls.length
    const typeSpy = vi.spyOn(bloomValkeyClient, 'customCommand').mockResolvedValue(1)
    try {
      await expect(
        checkBloomFilterRead({
          readyKey: 'ready',
          liveKey: 'test-key',
          value: 'blocked.example',
          existsIfReady: async () => false,
          repairUnavailableRead: async () => {
            repairs.push('repair')
          },
        }),
      ).resolves.toBe(false)
      expect(repairs).toEqual([])
      expect(typeSpy).toHaveBeenCalledWith(['TYPE', 'test-key'])
      expect(
        sentryCaptureExceptionMock.mock.calls
          .slice(reportedAt)
          .filter(
            ([error]) =>
              error instanceof Error &&
              error.message === 'Unexpected Valkey TYPE response for test-key',
          ),
      ).toHaveLength(1)
    } finally {
      typeSpy.mockRestore()
    }
  })
})
