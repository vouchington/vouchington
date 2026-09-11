import { describe, expect, it, vi } from 'vitest'
import type { workerQueueCommandClient } from '@data-stores/valkey-glide-mq'
import {
  abortOpenAiSpendCapDelayedJobRegistration,
  normalizeOpenAiSpendCapRegistration,
} from './spend-cap-delayed-job-registration.mts'

describe('OpenAI spend-cap delayed-job registration result handling', () => {
  it.each([undefined, [], [1, 'generation-a'], [1, 'generation-a', 0, 'extra']])(
    'rejects malformed registration result %j',
    result => {
      expect(() => normalizeOpenAiSpendCapRegistration(result)).toThrow(
        'Invalid OpenAI spend-cap registration result',
      )
    },
  )

  it('preserves both failures when reservation abort cannot run', async () => {
    const registrationError = new Error('job data update failed')
    const abortError = new Error('abort script unavailable')
    const invokeScript = vi
      .fn<Pick<typeof workerQueueCommandClient, 'invokeScript'>['invokeScript']>()
      .mockRejectedValue(abortError)

    await expect(
      abortOpenAiSpendCapDelayedJobRegistration(
        'registry-key',
        'job:job-a',
        'generation-a',
        { invokeScript },
        registrationError,
      ),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(AggregateError)
      expect((error as AggregateError).errors).toEqual([registrationError, abortError])
      expect((error as Error).cause).toBe(registrationError)
      return true
    })

    expect(invokeScript).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      keys: ['registry-key'],
      args: ['generation-a', 'job:job-a'],
    })
  })
})
