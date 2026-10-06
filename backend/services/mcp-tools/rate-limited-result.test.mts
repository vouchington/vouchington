import { describe, expect, it } from 'vitest'
import { buildRateLimitedToolResult } from './rate-limited-result.mts'

describe('buildRateLimitedToolResult', () => {
  const errorOf = (retryAfterSeconds: number) => {
    const [content] = buildRateLimitedToolResult(retryAfterSeconds).content
    return JSON.parse((content as { text: string }).text).error
  }

  it('refuses in-band with the wait the REST 429 would send', () => {
    expect(buildRateLimitedToolResult(45)).toMatchObject({ isError: true })
    expect(errorOf(45)).toEqual({
      status: 429,
      code: 'RATE_LIMIT',
      message: 'Rate limit exceeded. Please try again later.',
      retryable: true,
      retryAfterSeconds: 45,
    })
  })

  it.each([0, -1, 1.5, Number.NaN])('omits an unusable wait of %s', retryAfterSeconds => {
    expect(errorOf(retryAfterSeconds)).not.toHaveProperty('retryAfterSeconds')
  })
})
