import { describe, expect, it } from 'vitest'
import { HttpRateLimitError, HttpServerError } from '@modules/on-error/errors'
import { handleHttpErrors, isAmbiguousBilledHttpStatus } from '../http.mts'

function createResponse(status: number, headers: Record<string, string> = {}): Response {
  return { status, headers: new Headers(headers), body: null } as unknown as Response
}

describe('handleHttpErrors', () => {
  it('throws the app rate-limit error with the parsed retry delay', () => {
    const response = createResponse(429, { 'retry-after': '60' })
    expect(() => handleHttpErrors({ response, url: 'https://example.com' })).toThrow(
      expect.objectContaining({ constructor: HttpRateLimitError, retryAfterMs: 60_000 }),
    )
  })

  it('throws the app server error for 5xx responses', () => {
    const response = createResponse(503)
    expect(() => handleHttpErrors({ response, url: 'https://example.com' })).toThrow(
      HttpServerError,
    )
  })
})

describe('isAmbiguousBilledHttpStatus', () => {
  it.each([408, 409, 429, 500, 503])('treats %i as possibly billed', status => {
    expect(isAmbiguousBilledHttpStatus(status)).toBe(true)
  })

  it.each([200, 400, 401, 404])('treats %i as not billed', status => {
    expect(isAmbiguousBilledHttpStatus(status)).toBe(false)
  })
})
