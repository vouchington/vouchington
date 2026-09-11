import { it, expect, describe } from 'vitest'
import { isPermanentRssFetchError } from './is-permanent-fetch-error.mts'
import {
  CrawlerInvalidContentTypeError,
  CrawlerHttpClientError,
  CrawlerRateLimitError,
  CrawlerServerError,
  CrawlerTimeoutError,
  CrawlerNetworkError,
} from '@modules/on-error/errors'

describe('is-permanent-fetch-error', () => {
  const VALID_CONTENT_TYPES = ['application/rss+xml']

  it('isPermanentRssFetchError returns true for CrawlerInvalidContentTypeError', () => {
    const error = new CrawlerInvalidContentTypeError(
      'https://example.com',
      'text/html',
      100,
      VALID_CONTENT_TYPES,
    )
    expect(isPermanentRssFetchError(error)).toBe(true)
  })

  it('isPermanentRssFetchError returns true for CrawlerHttpClientError 404', () => {
    const error = new CrawlerHttpClientError('https://example.com', 404, 100)
    expect(isPermanentRssFetchError(error)).toBe(true)
  })

  it('isPermanentRssFetchError returns false for configured unreliable CrawlerHttpClientError 404', () => {
    const error = new CrawlerHttpClientError('https://example.com', 404, 100)
    expect(isPermanentRssFetchError(error, { unreliableStatusCodes: [404] })).toBe(false)
  })

  it('isPermanentRssFetchError returns true when unreliable status codes are empty', () => {
    const error = new CrawlerHttpClientError('https://example.com', 404, 100)
    expect(isPermanentRssFetchError(error, { unreliableStatusCodes: [] })).toBe(true)
  })

  it('isPermanentRssFetchError returns true for CrawlerHttpClientError 403', () => {
    const error = new CrawlerHttpClientError('https://example.com', 403, 100)
    expect(isPermanentRssFetchError(error)).toBe(true)
  })

  it('isPermanentRssFetchError returns true for CrawlerHttpClientError 401', () => {
    const error = new CrawlerHttpClientError('https://example.com', 401, 100)
    expect(isPermanentRssFetchError(error)).toBe(true)
  })

  it('isPermanentRssFetchError returns true for CrawlerHttpClientError 410', () => {
    const error = new CrawlerHttpClientError('https://example.com', 410, 100)
    expect(isPermanentRssFetchError(error)).toBe(true)
  })

  it('isPermanentRssFetchError returns true for parseFeed-tagged error', () => {
    const error = new Error('Failed to parse feed XML')
    Object.assign(error, { tags: { operation: 'parseFeed' } })
    expect(isPermanentRssFetchError(error)).toBe(true)
  })

  it('isPermanentRssFetchError returns false for CrawlerHttpClientError 408 (transient timeout)', () => {
    const error = new CrawlerHttpClientError('https://example.com', 408, 100)
    expect(isPermanentRssFetchError(error)).toBe(false)
  })

  it('isPermanentRssFetchError returns false for CrawlerHttpClientError 429 (rate limit)', () => {
    const error = new CrawlerHttpClientError('https://example.com', 429, 100)
    expect(isPermanentRssFetchError(error)).toBe(false)
  })

  it('isPermanentRssFetchError returns false for CrawlerRateLimitError', () => {
    const error = new CrawlerRateLimitError('https://example.com', 429, 100)
    expect(isPermanentRssFetchError(error)).toBe(false)
  })

  it('isPermanentRssFetchError returns false for CrawlerServerError', () => {
    const error = new CrawlerServerError('https://example.com', 500, 100)
    expect(isPermanentRssFetchError(error)).toBe(false)
  })

  it('isPermanentRssFetchError returns false for CrawlerTimeoutError', () => {
    const error = new CrawlerTimeoutError('https://example.com', 5000, 4980)
    expect(isPermanentRssFetchError(error)).toBe(false)
  })

  it('isPermanentRssFetchError returns false for CrawlerNetworkError', () => {
    const error = new CrawlerNetworkError('https://example.com', 100, new Error('ENOTFOUND'))
    expect(isPermanentRssFetchError(error)).toBe(false)
  })

  it('isPermanentRssFetchError returns false for plain Error without tags', () => {
    const error = new Error('Some generic error')
    expect(isPermanentRssFetchError(error)).toBe(false)
  })

  it('isPermanentRssFetchError returns false for Error with unrelated tags', () => {
    const error = new Error('Some error')
    Object.assign(error, { tags: { operation: 'somethingElse' } })
    expect(isPermanentRssFetchError(error)).toBe(false)
  })

  it('isPermanentRssFetchError returns false for non-Error values', () => {
    expect(isPermanentRssFetchError('string error')).toBe(false)
    expect(isPermanentRssFetchError(null)).toBe(false)
    expect(isPermanentRssFetchError(undefined)).toBe(false)
    expect(isPermanentRssFetchError(42)).toBe(false)
  })
})
