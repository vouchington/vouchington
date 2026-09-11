import { it, expect, describe } from 'vitest'
import { RateLimitError, APIError, InternalServerError } from 'openai'
import {
  isOpenAIRateLimitError,
  getRetryAfterDuration,
  isOpenAIServerError,
  isOpenAIFlexResourceUnavailableError,
} from './rate-limit.mts'

describe('rate-limit.generated', () => {
  // Tests for isOpenAIRateLimitError
  it('isOpenAIRateLimitError returns true for RateLimitError', () => {
    const error = new RateLimitError(429, {}, 'Rate limit exceeded', new Headers())
    expect(isOpenAIRateLimitError(error)).toBe(true)
  })

  it('isOpenAIRateLimitError returns true for APIError with status 429', () => {
    const error = new APIError(429, {}, 'Rate limit exceeded', new Headers())
    expect(isOpenAIRateLimitError(error)).toBe(true)
  })

  it('isOpenAIRateLimitError returns false for APIError with non-429 status', () => {
    const error = new APIError(500, {}, 'Internal server error', new Headers())
    expect(isOpenAIRateLimitError(error)).toBe(false)
  })

  it('isOpenAIRateLimitError returns false for non-OpenAI errors', () => {
    const error = new Error('Some other error')
    expect(isOpenAIRateLimitError(error)).toBe(false)
  })

  it('isOpenAIRateLimitError returns false for null', () => {
    expect(isOpenAIRateLimitError(null)).toBe(false)
  })

  it('isOpenAIRateLimitError returns false for undefined', () => {
    expect(isOpenAIRateLimitError()).toBe(false)
  })

  // Tests for getRetryAfterDuration
  it('getRetryAfterDuration extracts retry-after header from APIError', () => {
    const error = new APIError(
      429,
      {},
      'Rate limit exceeded',
      new Headers({
        'retry-after': '30',
      }),
    )
    expect(getRetryAfterDuration(error)).toBe(30000) // 30 seconds in milliseconds
  })

  it('getRetryAfterDuration extracts Retry-After header (capitalized) from APIError', () => {
    const error = new APIError(
      429,
      {},
      'Rate limit exceeded',
      new Headers({
        'Retry-After': '45',
      }),
    )
    expect(getRetryAfterDuration(error)).toBe(45000) // 45 seconds in milliseconds
  })

  it('getRetryAfterDuration defaults to 60 seconds when no retry-after header', () => {
    const error = new APIError(429, {}, 'Rate limit exceeded', new Headers())
    expect(getRetryAfterDuration(error)).toBe(60000) // 60 seconds in milliseconds
  })

  it('getRetryAfterDuration defaults to 60 seconds when retry-after is invalid', () => {
    const error = new APIError(
      429,
      {},
      'Rate limit exceeded',
      new Headers({
        'retry-after': 'invalid',
      }),
    )
    expect(getRetryAfterDuration(error)).toBe(60000) // 60 seconds in milliseconds
  })

  it('getRetryAfterDuration defaults to 60 seconds for non-APIError', () => {
    const error = new Error('Some error')
    expect(getRetryAfterDuration(error)).toBe(60000) // 60 seconds in milliseconds
  })

  it('getRetryAfterDuration defaults to 60 seconds when headers is undefined', () => {
    const error = new APIError(429, {}, 'Rate limit exceeded', undefined)
    expect(getRetryAfterDuration(error)).toBe(60000) // 60 seconds in milliseconds
  })

  it('getRetryAfterDuration handles RateLimitError without headers', () => {
    const error = new RateLimitError(429, {}, 'Rate limit exceeded', new Headers())
    expect(getRetryAfterDuration(error)).toBe(60000) // 60 seconds in milliseconds
  })

  // Tests for isOpenAIServerError
  it('isOpenAIServerError returns true for OpenAI 500', () => {
    const err = new InternalServerError(
      500,
      { message: 'Internal Server Error' },
      'ISE',
      new Headers(),
    )
    expect(isOpenAIServerError(err)).toBe(true)
  })

  it('isOpenAIServerError returns false for 429', () => {
    const err = new APIError(429, { message: 'Rate limit' }, 'RL', new Headers())
    expect(isOpenAIServerError(err)).toBe(false)
  })

  it('isOpenAIServerError returns false for 401', () => {
    const err = new APIError(401, { message: 'Unauthorized' }, 'AUTH', new Headers())
    expect(isOpenAIServerError(err)).toBe(false)
  })

  it('isOpenAIServerError returns false for non-Error', () => {
    expect(isOpenAIServerError(undefined)).toBe(false)
    expect(isOpenAIServerError('string error')).toBe(false)
  })

  // Tests for isOpenAIFlexResourceUnavailableError
  it('isOpenAIFlexResourceUnavailableError returns true for a 429 with code resource_unavailable', () => {
    const error = new APIError(
      429,
      { code: 'resource_unavailable', message: 'Resource Unavailable' },
      'Resource Unavailable',
      new Headers(),
    )
    expect(isOpenAIFlexResourceUnavailableError(error)).toBe(true)
  })

  it('isOpenAIFlexResourceUnavailableError matches the code case-insensitively', () => {
    const error = new APIError(
      429,
      { code: 'Resource_Unavailable' },
      'Resource Unavailable',
      new Headers(),
    )
    expect(isOpenAIFlexResourceUnavailableError(error)).toBe(true)
  })

  it('isOpenAIFlexResourceUnavailableError falls back to the message when there is no code', () => {
    const error = new APIError(429, undefined, 'Resource Unavailable', new Headers())
    expect(isOpenAIFlexResourceUnavailableError(error)).toBe(true)
  })

  it('isOpenAIFlexResourceUnavailableError returns false for an ordinary rate-limit 429', () => {
    const error = new RateLimitError(
      429,
      { code: 'rate_limit_exceeded' },
      'Rate limit exceeded',
      new Headers(),
    )
    expect(isOpenAIFlexResourceUnavailableError(error)).toBe(false)
  })

  it('isOpenAIFlexResourceUnavailableError returns false for a 5xx error', () => {
    const error = new InternalServerError(
      500,
      { message: 'Internal Server Error' },
      'ISE',
      new Headers(),
    )
    expect(isOpenAIFlexResourceUnavailableError(error)).toBe(false)
  })

  it('isOpenAIFlexResourceUnavailableError returns false for non-OpenAI errors', () => {
    expect(isOpenAIFlexResourceUnavailableError(new Error('boom'))).toBe(false)
  })

  it('isOpenAIFlexResourceUnavailableError returns false for undefined', () => {
    expect(isOpenAIFlexResourceUnavailableError()).toBe(false)
  })
})
