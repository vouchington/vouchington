import { describe, expect, it } from 'vitest'
import { isRetryableError } from '../http.mts'

describe('isRetryableError', () => {
  it('returns true for 500 status', () => {
    expect(isRetryableError(new Error(), 500)).toBe(true)
  })

  it('returns false for 429 status (rate limit is not a server error)', () => {
    expect(isRetryableError(new Error(), 429)).toBe(false)
  })

  it('combines known network error codes with HTTP status policy', () => {
    const err = Object.assign(new Error('connection failed'), { code: 'ECONNREFUSED' })
    expect(isRetryableError(err)).toBe(true)
  })

  it('retries local timeout errors', () => {
    const err = new DOMException('The operation timed out', 'TimeoutError')
    expect(isRetryableError(err)).toBe(true)
  })

  it('does not retry caller aborts', () => {
    const err = new Error('The operation was aborted')
    err.name = 'AbortError'
    expect(isRetryableError(err)).toBe(false)
  })
})
