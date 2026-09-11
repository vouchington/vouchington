import { describe, expect, it } from 'vitest'
import { buildQueryString } from './query-string.mts'

describe('buildQueryString', () => {
  it('builds a query string from params', () => {
    expect(buildQueryString({ foo: 'bar', n: 42 })).toBe('?foo=bar&n=42')
  })

  it('handles array values', () => {
    expect(buildQueryString({ tags: ['a', 'b'] })).toBe('?tags=a&tags=b')
  })

  it('skips null and undefined values but keeps empty string', () => {
    expect(buildQueryString({ a: null, b: undefined, c: '', d: 'ok' })).toBe('?c=&d=ok')
  })

  it('returns empty string when no params', () => {
    expect(buildQueryString({})).toBe('')
  })
})
