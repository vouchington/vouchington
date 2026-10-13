import { describe, expect, it, vi } from 'vitest'
import { ModelProviderError } from '@modules/model-providers/errors'
import { UnrecoverableError } from '@modules/queue-errors'
import { handleModelProviderError } from './provider-failure.mts'

function error(
  code: ConstructorParameters<typeof ModelProviderError>[0],
  options: Partial<ConstructorParameters<typeof ModelProviderError>[2]> = {},
) {
  return new ModelProviderError(code, `failure ${code}`, { retryClass: 'transient', ...options })
}

// Stands in for GlideMQ's DelayedError, which the worker turns into a delayed requeue of one job.
class StubDelayedError extends Error {}

// Mirrors the real job.moveToDelayed(): it always rejects.
function mockJob() {
  return {
    moveToDelayed: vi
      .fn<(timestamp: number) => Promise<never>>()
      .mockImplementation(async timestamp => {
        throw new StubDelayedError(String(timestamp))
      }),
  }
}

describe('handleModelProviderError', () => {
  it.each([
    ['rate-limited', 7_000, 7_000],
    ['overloaded', undefined, 60_000],
    ['rate-limited', 3_600_000, 900_000],
  ] as const)(
    'parks only the job for a %s failure for the provider wait, clamped',
    async (code, retryAfterMs, expectedMs) => {
      const job = mockJob()
      const before = Date.now()

      await expect(
        handleModelProviderError(error(code, { retryAfterMs, status: 429 }), job),
      ).rejects.toBeInstanceOf(StubDelayedError)

      const [delayedUntil] = job.moveToDelayed.mock.calls[0]
      expect(delayedUntil).toBeGreaterThanOrEqual(before + expectedMs)
      expect(delayedUntil).toBeLessThanOrEqual(Date.now() + expectedMs)
    },
  )

  it.each(['client-unavailable', 'credit-balance-too-low', 'invalid-response', 'refusal'] as const)(
    'ends the job for a permanent %s failure',
    async code => {
      const job = mockJob()

      await expect(
        handleModelProviderError(error(code, { retryClass: 'permanent' }), job),
      ).rejects.toBeInstanceOf(UnrecoverableError)

      expect(job.moveToDelayed).not.toHaveBeenCalled()
    },
  )

  it('lets the queue retry any other transient failure', async () => {
    const failure = error('server-error', { status: 503 })
    const job = mockJob()

    await expect(handleModelProviderError(failure, job)).rejects.toBe(failure)

    expect(job.moveToDelayed).not.toHaveBeenCalled()
  })
})
