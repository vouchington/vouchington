import { describe, expect, it } from 'vitest'
import { createCodedError } from './create-coded-error.mts'

describe('createCodedError', () => {
  it('returns an Error with correct .message, .status, and .code', () => {
    const err = createCodedError(400, 'Bad request', 'INVALID_INPUT')
    expect(() => {
      throw err
    }).toThrow(/^Bad request$/)
    expect(err.status).toBe(400)
    expect(err.code).toBe('INVALID_INPUT')
  })

  it('is instanceof Error', () => {
    const err = createCodedError(500, 'Internal error', 'INTERNAL_ERROR')
    expect(err).toBeInstanceOf(Error)
  })

  it('works for 400 Bad Request', () => {
    const err = createCodedError(400, 'Invalid input', 'INVALID_INPUT')
    expect(err.status).toBe(400)
    expect(err.code).toBe('INVALID_INPUT')
  })

  it('works for 401 Unauthorized', () => {
    const err = createCodedError(401, 'Authentication required', 'AUTH_REQUIRED')
    expect(err.status).toBe(401)
    expect(err.code).toBe('AUTH_REQUIRED')
  })

  it('works for 403 Forbidden', () => {
    const err = createCodedError(403, 'Forbidden', 'FORBIDDEN')
    expect(err.status).toBe(403)
    expect(err.code).toBe('FORBIDDEN')
  })

  it('works for 404 Not Found', () => {
    const err = createCodedError(404, 'Not found', 'NOT_FOUND')
    expect(err.status).toBe(404)
    expect(err.code).toBe('NOT_FOUND')
  })

  it('works for 429 Rate Limit', () => {
    const err = createCodedError(429, 'Rate limit exceeded', 'RATE_LIMIT')
    expect(err.status).toBe(429)
    expect(err.code).toBe('RATE_LIMIT')
  })

  it('works for 500 Internal Error', () => {
    const err = createCodedError(500, 'Something went wrong', 'INTERNAL_ERROR')
    expect(err.status).toBe(500)
    expect(err.code).toBe('INTERNAL_ERROR')
  })
})
