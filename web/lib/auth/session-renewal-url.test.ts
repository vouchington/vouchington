import { describe, expect, it } from 'vitest'
import { getSessionRenewalNext } from './session-renewal-url'

describe('session renewal navigation', () => {
  it.each([
    undefined,
    '//example.com',
    '/\\example.com',
    '/login',
    '/login?next=/news',
    '/session-renewal',
    '/session-renewal/',
    '/session%2drenewal',
    '/%6cogin',
  ])('rejects an external destination or renewal loop: %s', next => {
    expect(getSessionRenewalNext(next)).toBe('/')
  })
  it('retains a same-origin destination and query', () => {
    expect(getSessionRenewalNext('/news?topic=owned#latest')).toBe('/news?topic=owned#latest')
  })
})
