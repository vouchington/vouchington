import { describe, expect, it, vi } from 'vitest'
import { ModelProviderError } from '@vouchington/ai/providers'
import { UnrecoverableError } from '@vouchington/queue-errors'
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
  it.each(
    [
      '2024-02-29T23:59:59.999Z',
      '2024-03-01T00:00:00.001Z',
      '2024-12-31T23:59:59.999Z',
      '2025-01-01T00:00:00.001Z',
    ].flatMap(now =>
      (
        [
          ['rate-limited', 7_000, 7_000],
          ['overloaded', undefined, 60_000],
          ['rate-limited', 3_600_000, 900_000],
        ] as const
      ).map(scenario => [now, ...scenario] as const),
    ),
  )(
    'parks only the job at %s for a %s failure for the provider wait, clamped',
    async (now, code, retryAfterMs, expectedMs) => {
      const job = mockJob()
      vi.useFakeTimers({ toFake: ['Date'] })
      try {
        vi.setSystemTime(new Date(now))
        await expect(
          handleModelProviderError(error(code, { retryAfterMs, status: 429 }), job),
        ).rejects.toBeInstanceOf(StubDelayedError)
        expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(Date.parse(now) + expectedMs)
      } finally {
        vi.useRealTimers()
      }
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
