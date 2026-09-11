import { describe, expect, it } from 'vitest'
import {
  UnrecoverableError as GlideUnrecoverableError,
  Worker,
  type Worker as GlideWorker,
} from 'glide-mq'
import {
  handleBedrockRateLimit,
  isBedrockRateLimitError,
  UnrecoverableError,
  unrecoverable,
  wrapHttpForRetry,
} from './index.mts'

describe('queue error adapter', () => {
  it('keeps GlideMQ unrecoverable identity while delegating terminal errors upstream', () => {
    expect(UnrecoverableError).toBe(GlideUnrecoverableError)

    const source = new Error('invalid input')
    const terminal = catchThrown(() => unrecoverable(source, 'terminal'))

    expect(terminal).toBeInstanceOf(GlideUnrecoverableError)
    expect(terminal).toMatchObject({ message: 'terminal', stack: source.stack })

    const defaulted = catchThrown(() => unrecoverable(new Error('invalid input')))
    expect(defaulted).toBeInstanceOf(GlideUnrecoverableError)
    expect(defaulted).toMatchObject({ message: 'invalid input' })

    const plainObject = { message: 'invalid recipient', stack: 'provider stack' }
    expect(catchThrown(() => unrecoverable(plainObject))).toMatchObject({
      message: 'invalid recipient',
      stack: 'provider stack',
    })
  })

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

  it('recognizes Bedrock throttling and applies the fixed local cooldown', async () => {
    const calls: number[] = []
    const worker: Pick<GlideWorker, 'rateLimit'> = {
      rateLimit: async durationMs => void calls.push(durationMs),
    }
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

    const rateLimitError = await catchRejected(handleBedrockRateLimit(throttling, worker))
    expect(rateLimitError).toBeInstanceOf(Worker.RateLimitError)
    expect(rateLimitError).toMatchObject({
      name: 'RateLimitError',
      message: 'Rate limit exceeded',
      delayMs: 60_000,
    })
    expect(calls).toEqual([60_000])
  })

  it('preserves a worker rate-limit failure that only shares the control-flow error name', async () => {
    const failure = Object.assign(new Error('worker unavailable'), {
      name: 'RateLimitError',
      delayMs: 60_000,
    })
    const worker: Pick<GlideWorker, 'rateLimit'> = {
      rateLimit: async () => {
        throw failure
      },
    }
    const throttling = Object.assign(new Error('throttled'), { name: 'ThrottlingException' })

    expect(await catchRejected(handleBedrockRateLimit(throttling, worker))).toBe(failure)

    const localControlError = new Worker.RateLimitError()
    const controlErrorWorker: Pick<GlideWorker, 'rateLimit'> = {
      rateLimit: async () => {
        throw localControlError
      },
    }
    expect(await catchRejected(handleBedrockRateLimit(throttling, controlErrorWorker))).toBe(
      localControlError,
    )
  })

  it('delegates unhandled errors to the HTTP retry adapter', async () => {
    const worker: Pick<GlideWorker, 'rateLimit'> = { rateLimit: async () => undefined }
    const missing = Object.assign(new Error('missing'), { $metadata: { httpStatusCode: 404 } })
    expect(await catchRejected(handleBedrockRateLimit(missing, worker))).toBeInstanceOf(
      GlideUnrecoverableError,
    )

    const unavailable = Object.assign(new Error('unavailable'), { status: 503 })
    expect(await catchRejected(handleBedrockRateLimit(unavailable, worker))).toBe(unavailable)
  })
})

function catchThrown(callback: () => never): unknown {
  try {
    callback()
  } catch (error) {
    return error
  }
  throw new Error('Expected callback to throw')
}

async function catchRejected(promise: Promise<never>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('Expected promise to reject')
}
