import { describe, expect, it, vi } from 'vitest'

import { AutoHarnessError, AutoHarnessRequestTimeoutError } from 'auto-harness-client'

import { HarnessDispatchError } from 'auto-harness-client/actions'

import { isRetryableDispatchError, withSingleRetry } from './harness-dispatch-retry.mts'

function harnessError(status: number, retryAfter?: string) {
  return new AutoHarnessError('boom', { code: 'HTTP_ERROR', retryAfter, status })
}

describe('isRetryableDispatchError', () => {
  it.each([408, 429, 500, 502, 503, 504])('treats status %i as retryable', status => {
    expect(isRetryableDispatchError(harnessError(status))).toBe(true)
  })

  it.each([400, 401, 403, 404, 422])('treats status %i as non-retryable', status => {
    expect(isRetryableDispatchError(harnessError(status))).toBe(false)
  })

  it('treats a request timeout as retryable', () => {
    expect(isRetryableDispatchError(new AutoHarnessRequestTimeoutError(30_000))).toBe(true)
  })

  it('treats a fetch network TypeError as retryable', () => {
    expect(isRetryableDispatchError(new TypeError('fetch failed'))).toBe(true)
  })

  it('treats a HarnessDispatchError as non-retryable', () => {
    expect(isRetryableDispatchError(new HarnessDispatchError('CODE', 'message'))).toBe(false)
  })
})

describe('withSingleRetry', () => {
  it('retries once and returns the second attempt result on a retryable error', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(harnessError(500))
      .mockResolvedValueOnce('ok')

    await expect(withSingleRetry(operation)).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('does not retry a non-retryable 4xx error', async () => {
    const operation = vi.fn<() => Promise<string>>().mockRejectedValueOnce(harnessError(400))

    await expect(withSingleRetry(operation)).rejects.toMatchObject({ status: 400 })
    expect(operation).toHaveBeenCalledTimes(1)
  })

  it('does not retry a HarnessDispatchError', async () => {
    const error = new HarnessDispatchError('CODE', 'message')
    const operation = vi.fn<() => Promise<string>>().mockRejectedValueOnce(error)

    await expect(withSingleRetry(operation)).rejects.toBe(error)
    expect(operation).toHaveBeenCalledTimes(1)
  })

  it('exhausts its single retry and surfaces the last error', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(harnessError(500))
      .mockRejectedValueOnce(harnessError(502))

    await expect(withSingleRetry(operation)).rejects.toMatchObject({ status: 502 })
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('honors Retry-After instead of the fixed delay', async () => {
    vi.useFakeTimers()
    try {
      const operation = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(harnessError(429, '2'))
        .mockResolvedValueOnce('ok')

      const result = withSingleRetry(operation)
      await vi.advanceTimersByTimeAsync(2_000)

      await expect(result).resolves.toBe('ok')
    } finally {
      vi.useRealTimers()
    }
  })

  it('honors an HTTP-date Retry-After value', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'))
      const retryAfter = new Date('2024-01-01T00:00:03.000Z').toUTCString()
      const operation = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(harnessError(503, retryAfter))
        .mockResolvedValueOnce('ok')

      const result = withSingleRetry(operation)
      await vi.advanceTimersByTimeAsync(3_000)

      await expect(result).resolves.toBe('ok')
    } finally {
      vi.useRealTimers()
    }
  })

  it('falls back to the fixed delay for an unparseable Retry-After value', async () => {
    vi.useFakeTimers()
    try {
      const operation = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(harnessError(503, 'not-a-valid-value'))
        .mockResolvedValueOnce('ok')

      const result = withSingleRetry(operation)
      await vi.advanceTimersByTimeAsync(500)

      await expect(result).resolves.toBe('ok')
    } finally {
      vi.useRealTimers()
    }
  })
})
