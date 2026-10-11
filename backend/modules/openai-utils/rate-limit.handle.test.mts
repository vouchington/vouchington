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
  it('parks only the job until the Retry-After has passed', async () => {
    const delayed = new Error('delayed')
    const moveToDelayed = vi.fn<(timestamp: number) => Promise<never>>().mockRejectedValue(delayed)
    const before = Date.now()

    await expect(
      deferJobForOpenAIRateLimit(rateLimited({ 'retry-after': '20' }), { moveToDelayed }),
    ).rejects.toBe(delayed)

    const [delayedUntil] = moveToDelayed.mock.calls[0]
    expect(delayedUntil).toBeGreaterThanOrEqual(before + 20_000)
    expect(delayedUntil).toBeLessThanOrEqual(Date.now() + 20_000)
  })

  it('leaves other failures to the queue attempts without touching the job', async () => {
    const moveToDelayed = vi.fn<(timestamp: number) => Promise<never>>()
    const failure = new Error('not a rate limit')

    await expect(deferJobForOpenAIRateLimit(failure, { moveToDelayed })).rejects.toBe(failure)

    expect(moveToDelayed).not.toHaveBeenCalled()
  })
})
