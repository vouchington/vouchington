import { it, expect, describe } from 'vitest'
import {
  extractIdentifier,
  extractIdentifiers,
  extractRssFeedItemId,
  checkShouldReturnEmpty,
} from '../resolve.mts'

describe('resolve', () => {
  it('extractIdentifier returns undefined when param is absent', () => {
    expect(extractIdentifier({}, 'creator')).toBeUndefined()
  })

  it('extractIdentifier returns string when param is present', () => {
    expect(extractIdentifier({ creator: 'alice' }, 'creator')).toBe('alice')
  })

  it('extractIdentifiers deduplicates and lowercases', () => {
    const result = extractIdentifiers({ topic: 'Foo,bar,FOO' }, ['topic'], 10)
    expect(result).toEqual(['foo', 'bar'])
  })

  it('extractIdentifiers throws 422 when over max', () => {
    const query = { topic: 'a,b,c,d,e,f,g,h,i,j,k' }
    expect(() => extractIdentifiers(query, ['topic'], 10)).toThrow(Error)
  })

  it('extractIdentifiers merges multiple params', () => {
    const result = extractIdentifiers({ topic: 'a', topics: 'b,c' }, ['topic', 'topics'], 10)
    expect(result).toEqual(['a', 'b', 'c'])
  })

  it('extractRssFeedItemId returns undefined when absent', () => {
    expect(extractRssFeedItemId({}, 'similar_rss_feed_item')).toBeUndefined()
  })

  it('extractRssFeedItemId returns value for valid UUID', () => {
    const id = '01234567-89ab-7cde-8f01-234567890abc'
    expect(extractRssFeedItemId({ similar_rss_feed_item: id }, 'similar_rss_feed_item')).toBe(id)
  })

  it('extractRssFeedItemId throws 422 for invalid format', () => {
    expect(() =>
      extractRssFeedItemId({ similar_rss_feed_item: 'not-valid-format' }, 'similar_rss_feed_item'),
    ).toThrow(Error)
  })

  it('checkShouldReturnEmpty returns false when no identifiers provided', () => {
    expect(checkShouldReturnEmpty([{ identifier: undefined, resolved: undefined }], [])).toBe(false)
  })

  it('checkShouldReturnEmpty returns true when single identifier not resolved', () => {
    expect(checkShouldReturnEmpty([{ identifier: 'some-slug', resolved: null }], [])).toBe(true)
  })

  it('checkShouldReturnEmpty returns false when single identifier resolved', () => {
    expect(checkShouldReturnEmpty([{ identifier: 'some-slug', resolved: 'uuid-123' }], [])).toBe(
      false,
    )
  })

  it('checkShouldReturnEmpty returns true when any multi identifier not resolved', () => {
    expect(
      checkShouldReturnEmpty([], [{ identifiers: ['a', 'b'], resolved: ['uuid-1', null] }]),
    ).toBe(true)
  })

  it('checkShouldReturnEmpty returns false when all multi identifiers resolved', () => {
    expect(
      checkShouldReturnEmpty([], [{ identifiers: ['a', 'b'], resolved: ['uuid-1', 'uuid-2'] }]),
    ).toBe(false)
  })

  it('checkShouldReturnEmpty returns false when multi identifiers list is empty', () => {
    expect(checkShouldReturnEmpty([], [{ identifiers: [], resolved: [] }])).toBe(false)
  })
})
