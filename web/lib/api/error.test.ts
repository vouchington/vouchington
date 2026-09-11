import { describe, it, expect } from 'vitest'
import { ApiError, isExpectedApiError } from './error'

describe('ApiError', () => {
  it('sets Next.js native digest for 401/403/404', () => {
    expect(new ApiError('Not authenticated', 401).digest).toBe('NEXT_HTTP_ERROR_FALLBACK;401')
    expect(new ApiError('Forbidden', 403).digest).toBe('NEXT_HTTP_ERROR_FALLBACK;403')
    expect(new ApiError('Not found', 404).digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404')
  })

  it('sets status-bearing digest for other 4xx statuses', () => {
    expect(new ApiError('Bad request', 400).digest).toBe('EXPECTED_CLIENT_ERROR;400')
    expect(new ApiError('Rate limited', 429).digest).toBe('EXPECTED_CLIENT_ERROR;429')
  })

  it('does not set digest for non-4xx statuses', () => {
    expect(new ApiError('Server error', 500).digest).toBeUndefined()
    expect(new ApiError('Bad gateway', 502).digest).toBeUndefined()
  })

  it('preserves existing behavior for backend message extraction', () => {
    const error = new ApiError('fallback', 401, { message: 'Not authenticated' })
    expect(() => {
      throw error
    }).toThrow(/^Not authenticated$/)
    expect(error.status).toBe(401)
    expect(error.digest).toBe('NEXT_HTTP_ERROR_FALLBACK;401')
  })

  it('preserves code and requestId from data', () => {
    const error = new ApiError('Error', 401, {
      message: 'Unauthorized',
      code: 'SESSION_EXPIRED',
      request_id: 'req-123',
    })
    expect(error.code).toBe('SESSION_EXPIRED')
    expect(error.requestId).toBe('req-123')
    expect(error.digest).toBe('NEXT_HTTP_ERROR_FALLBACK;401')
  })
})

describe('isExpectedApiError', () => {
  it('returns true for 4xx ApiErrors', () => {
    expect(isExpectedApiError(new ApiError('Bad request', 400))).toBe(true)
    expect(isExpectedApiError(new ApiError('Not authenticated', 401))).toBe(true)
    expect(isExpectedApiError(new ApiError('Forbidden', 403))).toBe(true)
    expect(isExpectedApiError(new ApiError('Not found', 404))).toBe(true)
    expect(isExpectedApiError(new ApiError('Rate limited', 429))).toBe(true)
  })

  it('returns false for non-4xx ApiError', () => {
    expect(isExpectedApiError(new ApiError('Server error', 500))).toBe(false)
    expect(isExpectedApiError(new ApiError('Bad gateway', 502))).toBe(false)
  })

  it('returns false for non-ApiError values', () => {
    expect(isExpectedApiError(null)).toBe(false)
    expect(isExpectedApiError(undefined)).toBe(false)
    expect(isExpectedApiError('string')).toBe(false)
    expect(isExpectedApiError(42)).toBe(false)
    expect(isExpectedApiError(new Error('Not authenticated'))).toBe(false)
  })

  it('returns true for duck-typed 4xx ApiError objects', () => {
    expect(isExpectedApiError({ name: 'ApiError', status: 400 })).toBe(true)
    expect(isExpectedApiError({ name: 'ApiError', status: 401 })).toBe(true)
    expect(isExpectedApiError({ name: 'ApiError', status: 404 })).toBe(true)
    expect(isExpectedApiError({ name: 'ApiError', status: 429 })).toBe(true)
  })

  it('returns false for duck-typed non-4xx ApiError objects', () => {
    expect(isExpectedApiError({ name: 'ApiError', status: 500 })).toBe(false)
    expect(isExpectedApiError({ name: 'ApiError', status: 399 })).toBe(false)
  })

  it('returns false for string status (type guard)', () => {
    expect(isExpectedApiError({ name: 'ApiError', status: '401' })).toBe(false)
  })
})
