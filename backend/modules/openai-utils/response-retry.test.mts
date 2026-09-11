import { APIError } from 'openai'
import { describe, expect, it } from 'vitest'
import { getOpenAIResponseRetryDelayMs } from './response-retry.mts'

const MAX_RETRY_DELAY_MS = 8_000

describe('getOpenAIResponseRetryDelayMs', () => {
  it('clamps provider retry-after-ms and Retry-After to the 8s bound', () => {
    const retryAfterMs = new APIError(
      429,
      {},
      'rate limited',
      new Headers({ 'retry-after-ms': '60000' }),
    )
    const retryAfterSeconds = new APIError(
      429,
      {},
      'rate limited',
      new Headers({ 'retry-after': '120' }),
    )
    const farFuture = new Date(Date.now() + 3_600_000).toUTCString()
    const retryAfterDate = new APIError(
      429,
      {},
      'rate limited',
      new Headers({ 'retry-after': farFuture }),
    )

    expect(getOpenAIResponseRetryDelayMs(retryAfterMs, 0)).toBe(MAX_RETRY_DELAY_MS)
    expect(getOpenAIResponseRetryDelayMs(retryAfterSeconds, 0)).toBe(MAX_RETRY_DELAY_MS)
    expect(getOpenAIResponseRetryDelayMs(retryAfterDate, 0)).toBe(MAX_RETRY_DELAY_MS)
  })

  it('preserves a provider delay that is already under the bound', () => {
    const error = new APIError(429, {}, 'rate limited', new Headers({ 'retry-after-ms': '1500' }))

    expect(getOpenAIResponseRetryDelayMs(error, 0)).toBe(1500)
  })
})
