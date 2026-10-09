import { UnrecoverableError, Worker } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { HttpRateLimitError } from '@modules/on-error/errors'
import {
  clampRateLimitDelayMs,
  createRateLimitError,
  DEFAULT_RATE_LIMIT_DELAY_MS,
  deferJobForRateLimit,
  getRetryAfterMs,
  MAX_RATE_LIMIT_DELAY_MS,
  MIN_RATE_LIMIT_DELAY_MS,
  throwIfRateLimitedResponse,
  wrapHttpForRetry,
} from './index.mts'

function thrownBy(callback: () => void): unknown {
  try {
    callback()
  } catch (err) {
    return err
  }
  throw new Error('Expected the callback to throw')
}

// Stands in for GlideMQ's DelayedError, which job.moveToDelayed() always rejects with.
class StubDelayedError extends Error {}

// Shaped like the AWS SDK's deserialized SES failure: HTTP 400 with the code as the error name.
function sesError(name: string, message: string) {
  return Object.assign(new Error(message), {
    name,
    $fault: 'client',
    $metadata: { httpStatusCode: 400 },
  })
}

describe('clampRateLimitDelayMs', () => {
  it.each([
    [undefined, DEFAULT_RATE_LIMIT_DELAY_MS],
    [null, DEFAULT_RATE_LIMIT_DELAY_MS],
    [Number.NaN, DEFAULT_RATE_LIMIT_DELAY_MS],
    [0, MIN_RATE_LIMIT_DELAY_MS],
    [250, MIN_RATE_LIMIT_DELAY_MS],
    [30_000, 30_000],
    [1_500.2, 1_501],
    [Number.POSITIVE_INFINITY, DEFAULT_RATE_LIMIT_DELAY_MS],
    [24 * 60 * 60_000, MAX_RATE_LIMIT_DELAY_MS],
  ])('maps %s to %s', (retryAfterMs, expected) => {
    expect(clampRateLimitDelayMs(retryAfterMs)).toBe(expected)
  })
})

describe('createRateLimitError', () => {
  it('is the GlideMQ control-flow signal carrying the clamped wait and the cause', () => {
    const cause = new Error('429 from provider')
    const error = createRateLimitError(45_000, cause)

    expect(error).toBeInstanceOf(Worker.RateLimitError)
    expect(error).toMatchObject({ name: 'RateLimitError', delayMs: 45_000, cause })
    expect(createRateLimitError()).toMatchObject({ delayMs: DEFAULT_RATE_LIMIT_DELAY_MS })
    expect('cause' in createRateLimitError()).toBe(false)
  })
})

describe('deferJobForRateLimit', () => {
  it('parks the job until the clamped wait has passed and never resolves', async () => {
    const moveToDelayed = vi
      .fn<(timestamp: number) => Promise<never>>()
      .mockImplementation(async timestamp => {
        throw new StubDelayedError(String(timestamp))
      })
    const before = Date.now()

    await expect(deferJobForRateLimit({ moveToDelayed }, 20_000)).rejects.toBeInstanceOf(
      StubDelayedError,
    )

    const [delayedUntil] = moveToDelayed.mock.calls[0]
    expect(delayedUntil).toBeGreaterThanOrEqual(before + 20_000)
    expect(delayedUntil).toBeLessThanOrEqual(Date.now() + 20_000)
  })
})

describe('getRetryAfterMs', () => {
  it('reads a parsed wait, a fetch Headers bag, and a plain header map', () => {
    expect(getRetryAfterMs({ retryAfterMs: 1_200 })).toBe(1_200)
    expect(getRetryAfterMs({ headers: new Headers({ 'Retry-After': '30' }) })).toBe(30_000)
    expect(getRetryAfterMs({ headers: { 'retry-after': ['5', '9'] } })).toBe(5_000)
    expect(getRetryAfterMs({ retryAfterMs: null, headers: { 'retry-after': '2' } })).toBe(2_000)
  })

  it('returns null when the provider named no usable wait', () => {
    expect(getRetryAfterMs(null)).toBeNull()
    expect(getRetryAfterMs('429')).toBeNull()
    expect(getRetryAfterMs({ retryAfterMs: -1 })).toBeNull()
    expect(getRetryAfterMs({ headers: { 'retry-after': 'soon' } })).toBeNull()
    expect(getRetryAfterMs({ headers: new Headers() })).toBeNull()
  })
})

describe('throwIfRateLimitedResponse', () => {
  it('requeues a 429 with its Retry-After and keeps the status on the cause', () => {
    const response = { status: 429, headers: new Headers({ 'retry-after': '120' }) }

    const thrown = thrownBy(() =>
      throwIfRateLimitedResponse(response, 'https://api.example.test/following'),
    )

    expect(thrown).toBeInstanceOf(Worker.RateLimitError)
    expect(thrown).toMatchObject({
      delayMs: 120_000,
      cause: { status: 429, retryAfterMs: 120_000 },
    })
    expect(thrown).toHaveProperty('cause', expect.any(HttpRateLimitError))
  })

  it('requeues a 429 with no stated wait for the default wait', () => {
    const thrown = thrownBy(() =>
      throwIfRateLimitedResponse(
        { status: 429, headers: new Headers() },
        'https://api.example.test',
      ),
    )

    expect(thrown).toMatchObject({ delayMs: DEFAULT_RATE_LIMIT_DELAY_MS })
  })

  it.each([200, 403, 502])('returns normally for HTTP %s', status => {
    expect(() =>
      throwIfRateLimitedResponse({ status, headers: new Headers() }, 'https://api.example.test'),
    ).not.toThrow()
  })
})

describe('wrapHttpForRetry rate limits', () => {
  it('requeues a 429 that states its wait without consuming an attempt', () => {
    const fromHeader = Object.assign(new Error('429'), {
      status: 429,
      headers: new Headers({ 'retry-after': '90' }),
    })
    const fromHttpError = new HttpRateLimitError('https://remote.example.test/inbox', 429, 15_000)

    expect(thrownBy(() => wrapHttpForRetry(fromHeader))).toMatchObject({
      name: 'RateLimitError',
      delayMs: 90_000,
      cause: fromHeader,
    })
    expect(thrownBy(() => wrapHttpForRetry(fromHttpError))).toMatchObject({
      name: 'RateLimitError',
      delayMs: 15_000,
      cause: fromHttpError,
    })
  })

  it('keeps a 429 without a stated wait, and any 5xx, on the bounded attempt path', () => {
    const noWait = new HttpRateLimitError('https://remote.example.test/inbox', 429, null)
    const unavailable = Object.assign(new Error('503'), {
      status: 503,
      headers: { 'retry-after': '3600' },
    })

    expect(thrownBy(() => wrapHttpForRetry(noWait))).toBe(noWait)
    expect(thrownBy(() => wrapHttpForRetry(unavailable))).toBe(unavailable)
  })
})

describe('wrapHttpForRetry AWS throttling', () => {
  it.each([
    sesError('Throttling', 'Maximum sending rate exceeded.'),
    sesError('Throttling', 'Daily message quota exceeded'),
    sesError('ThrottlingException', 'Rate exceeded'),
    sesError('Error', 'Maximum sending rate exceeded.'),
  ])('retries SES throttling even though it is HTTP 400: $name $message', throttling => {
    expect(thrownBy(() => wrapHttpForRetry(throttling))).toBe(throttling)
  })

  it('still ends the job for any other client error', () => {
    for (const rejected of [
      sesError('MessageRejected', 'Email address is not verified.'),
      sesError('AccountSendingPausedException', 'Sending paused.'),
    ]) {
      expect(thrownBy(() => wrapHttpForRetry(rejected))).toBeInstanceOf(UnrecoverableError)
    }
  })
})
