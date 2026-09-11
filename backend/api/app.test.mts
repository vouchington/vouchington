import { describe, it, expect } from 'vitest'
import {
  getErrorResponseCode,
  getErrorResponseMessage,
  getErrorResponseStack,
  getErrorStatus,
  normalizeErrorForLogging,
} from './app.mts'

describe('getErrorStatus', () => {
  it('returns 500 for an error with no status', () => {
    expect(getErrorStatus(new Error('boom'))).toBe(500)
  })

  it('returns 500 for an error with NaN status', () => {
    const err = Object.assign(new Error('bad status'), { status: NaN })
    expect(getErrorStatus(err)).toBe(500)
  })

  it('returns 500 for an error with a float status', () => {
    const err = Object.assign(new Error('bad status'), { status: 404.5 })
    expect(getErrorStatus(err)).toBe(500)
  })

  it('returns 500 for an error with status below 100', () => {
    const err = Object.assign(new Error('bad status'), { status: 99 })
    expect(getErrorStatus(err)).toBe(500)
  })

  it('returns 500 for an error with status >= 600', () => {
    const err = Object.assign(new Error('bad status'), { status: 600 })
    expect(getErrorStatus(err)).toBe(500)
  })

  it('returns 500 when error is null', () => {
    expect(getErrorStatus(null)).toBe(500)
  })

  it('returns 500 when error is a string', () => {
    expect(getErrorStatus('not an error')).toBe(500)
  })

  it('returns the valid status for a 401 http-errors error', () => {
    const err = Object.assign(new Error('Unauthorized'), { status: 401 })
    expect(getErrorStatus(err)).toBe(401)
  })

  it('returns the valid status for a 500 error', () => {
    const err = Object.assign(new Error('Internal Server Error'), { status: 500 })
    expect(getErrorStatus(err)).toBe(500)
  })

  it('returns the valid statusCode when status is missing', () => {
    const err = Object.assign(new Error('unprocessable'), { statusCode: 422 })
    expect(getErrorStatus(err)).toBe(422)
  })

  it('prefers status over statusCode when both are present', () => {
    const err = Object.assign(new Error('unauthorized'), { status: 401, statusCode: 500 })
    expect(getErrorStatus(err)).toBe(401)
  })

  it('returns 100 for the minimum valid status', () => {
    const err = Object.assign(new Error('continue'), { status: 100 })
    expect(getErrorStatus(err)).toBe(100)
  })

  it('returns 599 for the maximum valid status', () => {
    const err = Object.assign(new Error('unknown'), { status: 599 })
    expect(getErrorStatus(err)).toBe(599)
  })
})

describe('error response helpers', () => {
  it('returns Error messages directly', () => {
    expect(getErrorResponseMessage(new Error('boom'), 500)).toBe('boom')
  })

  it('uses status text for nullish thrown values', () => {
    expect(getErrorResponseMessage(null, 500)).toBe('Internal Server Error')
    expect(getErrorResponseMessage(undefined, 502)).toBe('Bad Gateway')
  })

  it('stringifies primitive thrown values', () => {
    expect(getErrorResponseMessage('plain string', 500)).toBe('plain string')
  })

  it('returns messages from plain object thrown values', () => {
    expect(getErrorResponseMessage({ message: 'custom object message' }, 500)).toBe(
      'custom object message',
    )
  })

  it('stringifies non-string plain object messages', () => {
    expect(getErrorResponseMessage({ message: 123 }, 500)).toBe('123')
  })

  it('uses status text for plain object messages that cannot stringify', () => {
    const message = Object.create(null)
    expect(getErrorResponseMessage({ message }, 500)).toBe('Internal Server Error')
  })

  it('uses status text for object thrown values without messages', () => {
    const error = Object.assign(Object.create(null) as Record<string, unknown>, { status: 400 })
    expect(getErrorResponseMessage(error, 400)).toBe('Bad Request')
  })

  it('returns custom string error codes', () => {
    expect(getErrorResponseCode({ code: 'CUSTOM_CODE' }, 500)).toBe('CUSTOM_CODE')
  })

  it('defaults 5xx errors to the internal error code', () => {
    expect(getErrorResponseCode(new Error('boom'), 500)).toBe('INTERNAL_ERROR')
  })

  it('leaves 4xx errors without a fallback code', () => {
    expect(getErrorResponseCode(new Error('bad request'), 400)).toBeUndefined()
  })

  it('returns object-like stacks and ignores non-object stacks', () => {
    const error = new Error('boom')
    expect(getErrorResponseStack(error)).toBe(error.stack)
    expect(getErrorResponseStack({ stack: 'custom stack' })).toBe('custom stack')
    expect(getErrorResponseStack('plain string')).toBeUndefined()
  })
})

describe('normalizeErrorForLogging', () => {
  it('normalizes invalid status errors to the response status before logging', () => {
    const error = Object.assign(new Error('bad status'), { status: 99 })
    expect(normalizeErrorForLogging(error)).toBe(error)
    expect(error.status).toBe(500)
  })

  it('preserves valid 4xx statuses for logging suppression', () => {
    const error = Object.assign(new Error('not found'), { status: 404 })
    expect(normalizeErrorForLogging(error)).toBe(error)
    expect(error.status).toBe(404)
  })
})
