import { describe, expect, it, vi } from 'vitest'
import type { workerQueueCommandClient } from '@data-stores/valkey-glide-mq'
import {
  openAiSpendCapDelayedRegistryKey,
  reopenOpenAiSpendCapDelayedJobRegistration,
} from './spend-cap-delayed-jobs.mts'

describe('reopenOpenAiSpendCapDelayedJobRegistration', () => {
  it.each([
    [1, true],
    [0, false],
  ])('maps conditional reopen script result %s to %s', async (scriptResult, expected) => {
    const day = '2026-08-16'
    const invokeScript = vi
      .fn<Pick<typeof workerQueueCommandClient, 'invokeScript'>['invokeScript']>()
      .mockResolvedValue(scriptResult)
    const hset = vi.fn<Pick<typeof workerQueueCommandClient, 'hset'>['hset']>()

    await expect(
      reopenOpenAiSpendCapDelayedJobRegistration(day, 'generation-a', { invokeScript, hset }),
    ).resolves.toBe(expected)

    expect(invokeScript).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      keys: [openAiSpendCapDelayedRegistryKey(day)],
      args: ['generation-a'],
    })
  })
})
