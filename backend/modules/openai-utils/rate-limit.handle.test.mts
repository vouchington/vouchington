import { describe, expect, it, vi } from 'vitest'
import { APIError, RateLimitError } from 'openai'
import {
  deferJobForOpenAIRateLimit,
  getOpenAIRateLimitDelayMs,
  handleOpenAIRateLimit,
} from './rate-limit.mts'

function rateLimited(headers: Record<string, string> = {}) {
  return new RateLimitError(429, {}, 'Rate limit exceeded', new Headers(headers))
}

describe('getOpenAIRateLimitDelayMs', () => {
  it.each([
    [{ 'retry-after': '30' }, 30_000],
    [{ 'retry-after': '0' }, 1_000],
    [{ 'retry-after': '86400' }, 900_000],
    [{}, 60_000],
    [{ 'retry-after': 'soon' }, 60_000],
  ])('turns %j into %s ms', (headers, expectedMs) => {
    expect(getOpenAIRateLimitDelayMs(rateLimited(headers))).toBe(expectedMs)
  })
})

describe('handleOpenAIRateLimit', () => {
  it('requeues the job for the Retry-After carried on the signal itself', async () => {
    const error = rateLimited({ 'retry-after': '30' })

    await expect(handleOpenAIRateLimit(error)).rejects.toMatchObject({
      name: 'RateLimitError',
      delayMs: 30_000,
      cause: error,
    })
  })

  it('rethrows any other failure unchanged, wrapping a non-Error value', async () => {
    const outage = new APIError(500, {}, 'server error', new Headers())

    await expect(handleOpenAIRateLimit(outage)).rejects.toBe(outage)
    await expect(handleOpenAIRateLimit('boom')).rejects.toMatchObject({
      message: 'OpenAI rate limit handling failed',
      cause: 'boom',
    })
  })
})

describe('deferJobForOpenAIRateLimit', () => {
  it.each([
    '2024-02-29T23:59:59.999Z',
    '2024-03-01T00:00:00.001Z',
    '2024-12-31T23:59:59.999Z',
    '2025-01-01T00:00:00.001Z',
  ])('parks only the job for exactly Retry-After at %s', async now => {
    const delayed = new Error('delayed')
    const moveToDelayed = vi.fn<(timestamp: number) => Promise<never>>().mockRejectedValue(delayed)
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(now))
      await expect(
        deferJobForOpenAIRateLimit(rateLimited({ 'retry-after': '20' }), { moveToDelayed }),
      ).rejects.toBe(delayed)
      expect(moveToDelayed).toHaveBeenCalledExactlyOnceWith(Date.parse(now) + 20_000)
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves other failures to the queue attempts without touching the job', async () => {
    const moveToDelayed = vi.fn<(timestamp: number) => Promise<never>>()
    const failure = new Error('not a rate limit')

    await expect(deferJobForOpenAIRateLimit(failure, { moveToDelayed })).rejects.toBe(failure)

    expect(moveToDelayed).not.toHaveBeenCalled()
  })
})
