import { describe, expect, it } from 'vitest'
import {
  emptyUrlListResponse,
  isUrlSearchQueryBelowMinLength,
  normalizeUrlSearchQuery,
  URL_QUERY_MIN_LENGTH,
} from './url-query-min-length'

describe('url query min-length helpers', () => {
  it(`exports URL_QUERY_MIN_LENGTH = ${URL_QUERY_MIN_LENGTH}`, () => {
    expect(URL_QUERY_MIN_LENGTH).toBe(3)
  })

  it('normalizes blank and padded queries', () => {
    expect(normalizeUrlSearchQuery(undefined)).toBeUndefined()
    expect(normalizeUrlSearchQuery('')).toBeUndefined()
    expect(normalizeUrlSearchQuery('   ')).toBeUndefined()
    expect(normalizeUrlSearchQuery('  https://example.com  ')).toBe('https://example.com')
  })

  it('treats only non-empty trimmed queries shorter than the minimum as below length', () => {
    expect(isUrlSearchQueryBelowMinLength(undefined)).toBe(false)
    expect(isUrlSearchQueryBelowMinLength('')).toBe(false)
    expect(isUrlSearchQueryBelowMinLength('   ')).toBe(false)
    expect(isUrlSearchQueryBelowMinLength('h')).toBe(true)
    expect(isUrlSearchQueryBelowMinLength('ht')).toBe(true)
    expect(isUrlSearchQueryBelowMinLength('  ab  ')).toBe(true)
    expect(isUrlSearchQueryBelowMinLength('htt')).toBe(false)
    expect(isUrlSearchQueryBelowMinLength(3)).toBe(false)
  })

  it('returns an empty list envelope for short-circuit callers', () => {
    expect(emptyUrlListResponse()).toEqual({
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })
  })
})
