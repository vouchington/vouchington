import { expect, it, describe } from 'vitest'
import { getBookmarkBloomFilter, normalizeBookmarkObjectIds } from './bloom-filter-utils.mts'

describe('bloom-filter-utils.generated', () => {
  it('normalizeBookmarkObjectIds lowercases and normalizes keys', () => {
    const result = normalizeBookmarkObjectIds(['ABC-123', 'def-456'])
    expect(result).toEqual(['abc-123', 'def-456'])
  })

  it('getBookmarkBloomFilterName returns expected key format', () => {
    expect(getBookmarkBloomFilter('user-1').getKey()).toBe('bloom-filter:user-bookmarks:user-1')
  })
})
