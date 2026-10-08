import { Worker } from 'glide-mq'
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

describe('handleModelProviderError', () => {
  it.each([
    ['rate-limited', 7_000, 7_000],
    ['overloaded', undefined, 60_000],
  ] as const)(
    'defers the queue and the job for a %s failure',
    async (code, retryAfterMs, expectedMs) => {
      const rateLimit = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined)

      await expect(
        handleModelProviderError(error(code, { retryAfterMs, status: 429 }), { rateLimit }),
      ).rejects.toBeInstanceOf(Worker.RateLimitError)

      expect(rateLimit).toHaveBeenCalledExactlyOnceWith(expectedMs)
    },
  )

  it.each(['client-unavailable', 'credit-balance-too-low', 'invalid-response', 'refusal'] as const)(
    'ends the job for a permanent %s failure',
    async code => {
      const rateLimit = vi.fn<(ms: number) => Promise<void>>()

      await expect(
        handleModelProviderError(error(code, { retryClass: 'permanent' }), { rateLimit }),
      ).rejects.toBeInstanceOf(UnrecoverableError)

      expect(rateLimit).not.toHaveBeenCalled()
    },
  )

  it('lets the queue retry any other transient failure', async () => {
    const failure = error('server-error', { status: 503 })

    await expect(
      handleModelProviderError(failure, { rateLimit: vi.fn<(ms: number) => Promise<void>>() }),
    ).rejects.toBe(failure)
  })
})
