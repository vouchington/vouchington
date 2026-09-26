import { describe, expect, it } from 'vitest'
import { EMPTY_RESULTS, type SearchResults } from '../../command-search-data'
import { hasVisibleSearchResults } from '../visible-results'

const topicResults: SearchResults = {
  ...EMPTY_RESULTS,
  topics: [{ id: 'topic' } as SearchResults['topics'][number]],
}

const newsResults: SearchResults = {
  ...EMPTY_RESULTS,
  news: [{ id: 'news' } as SearchResults['news'][number]],
}

describe('hasVisibleSearchResults', () => {
  it('hides page shortcuts on an entity tab with no matches', () => {
    expect(hasVisibleSearchResults('topics', EMPTY_RESULTS, 2)).toBe(false)
  })

  it('shows entity matches on that tab', () => {
    expect(hasVisibleSearchResults('topics', topicResults, 2)).toBe(true)
  })

  it('shows page shortcuts only on the pages and all tabs', () => {
    expect(hasVisibleSearchResults('pages', EMPTY_RESULTS, 1)).toBe(true)
    expect(hasVisibleSearchResults('all', EMPTY_RESULTS, 1)).toBe(true)
    expect(hasVisibleSearchResults('pages', EMPTY_RESULTS, 0)).toBe(false)
  })

  it('shows any entity bucket on the all tab', () => {
    expect(hasVisibleSearchResults('all', newsResults, 0)).toBe(true)
    expect(hasVisibleSearchResults('posts', newsResults, 0)).toBe(false)
  })
})
