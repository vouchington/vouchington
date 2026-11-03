import { describe, expect, it, vi } from 'vitest'
import type { workerQueueCommandClient } from '@data-stores/valkey-glide-mq'
import { completeSpendCapDelayedJobRelease } from './spend-cap-delayed-job-release.mts'
import { spendCapDelayedRegistryKey } from './spend-cap-delayed-jobs.mts'

describe('completeSpendCapDelayedJobRelease', () => {
  it.each([
    [1, true],
    [0, false],
  ])('maps lease-fenced completion script result %s to %s', async (scriptResult, expected) => {
    const day = '2026-08-16'
    const invokeScript = vi
      .fn<Pick<typeof workerQueueCommandClient, 'invokeScript'>['invokeScript']>()
      .mockResolvedValue(scriptResult)
    const hlen = vi.fn<Pick<typeof workerQueueCommandClient, 'hlen'>['hlen']>()
    const hscan = vi.fn<Pick<typeof workerQueueCommandClient, 'hscan'>['hscan']>()

    await expect(
      completeSpendCapDelayedJobRelease(day, 'generation-a', 'lease-a', {
        invokeScript,
        hlen,
        hscan,
      }),
    ).resolves.toBe(expected)

    expect(invokeScript).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      keys: [spendCapDelayedRegistryKey(day)],
      args: ['generation-a', 'lease-a'],
    })
  })
})
