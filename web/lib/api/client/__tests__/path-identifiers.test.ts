import { describe, expect, it } from 'vitest'
import { assertEncodablePathSegmentIdentifier, assertPathIdentifier } from '../path-identifiers'

describe('assertPathIdentifier', () => {
  it('accepts normal identifiers', () => {
    expect(assertPathIdentifier('post-123')).toBe('post-123')
  })

  it('rejects dot path segments', () => {
    expect(() => assertPathIdentifier('.')).toThrow('Invalid identifier')
    expect(() => assertPathIdentifier('..')).toThrow('Invalid identifier')
  })

  it('rejects path separators', () => {
    expect(() => assertPathIdentifier('feed/item')).toThrow('Invalid identifier')
    expect(() => assertPathIdentifier(String.raw`feed\item`)).toThrow('Invalid identifier')
  })
})

describe('assertEncodablePathSegmentIdentifier', () => {
  it('accepts RSS feed item identifiers that become a single segment after encoding', () => {
    const identifier = 'feed-id:https://example.com/item/1'

    expect(assertEncodablePathSegmentIdentifier(identifier)).toBe(identifier)
    expect(encodeURIComponent(identifier)).toBe('feed-id%3Ahttps%3A%2F%2Fexample.com%2Fitem%2F1')
  })

  it('rejects dot path segments and backslashes', () => {
    expect(() => assertEncodablePathSegmentIdentifier('.')).toThrow('Invalid identifier')
    expect(() => assertEncodablePathSegmentIdentifier('..')).toThrow('Invalid identifier')
    expect(() => assertEncodablePathSegmentIdentifier(String.raw`feed\item`)).toThrow(
      'Invalid identifier',
    )
  })
})
