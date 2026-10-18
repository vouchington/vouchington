import { describe, expect, it } from 'vitest'
import { UnrecoverableError as GlideUnrecoverableError } from 'glide-mq'
import {
  isBedrockRateLimitError,
  wrapHttpForRetry,
} from './index.mts'

describe('queue error adapter', () => {
  it('preserves status, statusCode, and AWS metadata precedence for HTTP classification', () => {
    const statusWins = Object.assign(new Error('server error'), {
      status: 503,
      statusCode: 400,
      $metadata: { httpStatusCode: 400 },
    })
    expect(catchThrown(() => wrapHttpForRetry(statusWins))).toBe(statusWins)

    const statusCodeWins = Object.assign(new Error('missing'), {
      statusCode: 404,
      $metadata: { httpStatusCode: 503 },
    })
    expect(catchThrown(() => wrapHttpForRetry(statusCodeWins))).toBeInstanceOf(
      GlideUnrecoverableError,
    )

    const metadataOnly = Object.assign(new Error('invalid request'), {
      $metadata: { httpStatusCode: 400 },
    })
    expect(catchThrown(() => wrapHttpForRetry(metadataOnly))).toBeInstanceOf(
      GlideUnrecoverableError,
    )

    const plainObject = { status: 400, message: 'invalid recipient' }
    expect(catchThrown(() => wrapHttpForRetry(plainObject))).toMatchObject({
      message: 'invalid recipient',
    })
  })

  it('rethrows every retryable HTTP boundary without changing identity', () => {
    for (const status of [408, 429, 500]) {
      const retryable = Object.assign(new Error(`retry ${status}`), { status })
      expect(catchThrown(() => wrapHttpForRetry(retryable))).toBe(retryable)
    }

    const missingStatus = new Error('network failure')
    expect(catchThrown(() => wrapHttpForRetry(missingStatus))).toBe(missingStatus)
  })

  it('recognizes Bedrock throttling from the provider error', () => {
    const throttling = Object.assign(new Error('throttled'), { name: 'ThrottlingException' })

    expect(isBedrockRateLimitError(throttling)).toBe(true)
    expect(
      isBedrockRateLimitError(
        Object.assign(new Error('rate limited'), { $metadata: { httpStatusCode: 429 } }),
      ),
    ).toBe(true)
    expect(
      isBedrockRateLimitError(
        Object.assign(new Error('rate limited'), {
          status: 503,
          $metadata: { httpStatusCode: 429 },
        }),
      ),
    ).toBe(true)
    expect(isBedrockRateLimitError(Object.assign(new Error('rate limited'), { status: 429 }))).toBe(
      false,
    )
    expect(isBedrockRateLimitError({ name: 'ThrottlingException' })).toBe(false)
  })
})

function catchThrown(callback: () => never): unknown {
  try {
    callback()
  } catch (err) {
    return err
  }
  throw new Error('Expected callback to throw')
}
