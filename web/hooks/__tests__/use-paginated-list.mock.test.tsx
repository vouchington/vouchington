import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPaginatedPage } from '@/lib/api/client'
import { usePaginatedList } from '../use-paginated-list'

vi.mock(import('@/lib/api/client'), () => ({
  getPaginatedPage: vi.fn<VitestLooseMock>(),
}))

interface TestPage {
  items: string[]
  page_info: { has_next_page: boolean; end_cursor: string | null }
}

function makePage(items: string[], endCursor: string | null): TestPage {
  return { items, page_info: { has_next_page: endCursor !== null, end_cursor: endCursor } }
}

describe('usePaginatedList app adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('continues through the paginated API client with the merged cursor param', async () => {
    const initial = makePage(['first'], 'opaque-cursor')
    const nextPage = makePage(['second'], null)
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(nextPage)
    const { result } = renderHook(() => usePaginatedList(initial, '/api/v1/items', { q: 'a' }))

    await act(async () => result.current.loadMore())

    expect(getPaginatedPage).toHaveBeenCalledWith('/api/v1/items', {
      q: 'a',
      after: 'opaque-cursor',
    })
    expect(result.current.pages).toEqual([initial, nextPage])
  })

  it('refreshes loaded pages through the paginated API client', async () => {
    const initial = makePage(['first'], 'c1')
    const second = makePage(['second'], null)
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(second)
    const { result } = renderHook(() => usePaginatedList(initial, '/api/v1/items', {}))
    await act(async () => result.current.loadMore())
    const refreshedFirst = makePage(['first-new'], 'c2')
    const refreshedSecond = makePage(['second-new'], null)
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(refreshedSecond)

    await act(async () => result.current.refreshLoadedPages(async () => refreshedFirst))

    expect(getPaginatedPage).toHaveBeenLastCalledWith('/api/v1/items', { after: 'c2' })
    expect(result.current.pages).toEqual([refreshedFirst, refreshedSecond])
  })

  it('prefers a custom loader over the default client', async () => {
    const initial = makePage(['first'], 'opaque-cursor')
    const nextPage = makePage(['second'], null)
    const loadPage = vi.fn<(after: string) => Promise<TestPage>>().mockResolvedValue(nextPage)
    const { result } = renderHook(() =>
      usePaginatedList(initial, '/api/v1/items', {}, { loadPage }),
    )

    await act(async () => result.current.loadMore())

    expect(loadPage).toHaveBeenCalledWith('opaque-cursor')
    expect(getPaginatedPage).not.toHaveBeenCalled()
  })

  it('prefers an endpoint-aware fetcher over the default client', async () => {
    const initial = makePage(['first'], 'opaque-cursor')
    const fetchPage = vi
      .fn<(endpoint: string, params: { after?: string }) => Promise<TestPage>>()
      .mockResolvedValue(makePage(['second'], null))
    const { result } = renderHook(() =>
      usePaginatedList(initial, '/api/v1/items', {}, { fetchPage }),
    )

    await act(async () => result.current.loadMore())

    expect(fetchPage).toHaveBeenCalledWith('/api/v1/items', { after: 'opaque-cursor' })
    expect(getPaginatedPage).not.toHaveBeenCalled()
  })
})
