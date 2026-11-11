import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { EMPTY_RESULTS, type SearchResults, type SearchTab } from '../command-search-data'
import { usePostContinuation } from './use-post-continuation'
import { fetchCombinedSearch } from '@/lib/api/client/search'
import { searchPostsOnly } from '../command-search-data-search'

vi.mock(import('@/lib/api/client/search'), () => ({
  fetchCombinedSearch: vi.fn<typeof fetchCombinedSearch>(),
}))
vi.mock(import('../command-search-data-search'), async importOriginal => ({
  ...(await importOriginal()),
  searchPostsOnly: vi.fn<typeof searchPostsOnly>(),
}))

const pageInfo = { start_cursor: null, end_cursor: 'cursor-1', has_next_page: true }
const nextInfo = { start_cursor: null, end_cursor: null, has_next_page: false }

function useProbe({ query, tab }: { query: string; tab: SearchTab }) {
  const [results, setResults] = useState<SearchResults>({
    ...EMPTY_RESULTS,
    searchKey: `${tab}\0${query}`,
    posts_page_info: pageInfo,
  })
  const continuation = usePostContinuation(query, tab, results, setResults)
  return { ...continuation, results, setResults }
}

describe('post search continuation', () => {
  it.each(['all', 'posts'] as const)(
    'continues an empty %s page with its query and cursor',
    async tab => {
      const response: SearchResults = { ...EMPTY_RESULTS, posts_page_info: nextInfo }
      const fetcher = tab === 'all' ? vi.mocked(fetchCombinedSearch) : vi.mocked(searchPostsOnly)
      fetcher.mockResolvedValueOnce(response)
      const { result } = renderHook(useProbe, { initialProps: { query: 'travel rewards', tab } })
      expect(result.current.canLoadMore).toBe(true)
      await act(async () => {
        await result.current.handleLoadMore()
      })
      expect(fetcher).toHaveBeenCalledWith('travel rewards', expect.any(AbortSignal), 'cursor-1')
      expect(result.current.results.posts_page_info).toEqual(nextInfo)
      expect(result.current.canLoadMore).toBe(false)
    },
  )

  it.each([
    { query: 'new', tab: 'all' as SearchTab },
    { query: 'old', tab: 'posts' as SearchTab },
  ])('discards an in-flight continuation when query or tab changes', async ({ query, tab }) => {
    let resolve!: (value: SearchResults) => void
    vi.mocked(fetchCombinedSearch).mockReturnValueOnce(
      new Promise(done => {
        resolve = done
      }),
    )
    const { result, rerender } = renderHook(useProbe, {
      initialProps: { query: 'old', tab: 'all' as SearchTab },
    })
    let pending!: Promise<void>
    act(() => {
      pending = result.current.handleLoadMore()
    })
    rerender({ query, tab })
    act(() =>
      result.current.setResults({
        ...EMPTY_RESULTS,
        searchKey: `${tab}\0${query}`,
        posts_page_info: pageInfo,
      }),
    )
    await act(async () => {
      resolve({ ...EMPTY_RESULTS, posts_page_info: nextInfo })
      await pending
    })
    expect(result.current.results.searchKey).toBe(`${tab}\0${query}`)
    expect(result.current.results.posts_page_info).toEqual(pageInfo)
  })
})
