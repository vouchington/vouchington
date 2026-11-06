import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { getPaginatedPage } from '@/lib/api/client'
import { usePaginatedList } from '../use-paginated-list'
import { HackerNewsReferenceRefreshGenerationContext } from '@/components/hacker-news/hacker-news-config-context'
import { useHackerNewsReferenceRefresh } from '@/components/hacker-news/use-hacker-news-reference-refresh'
import { AuthContext } from '@/lib/auth/context'
import type { ClientAuthUser } from '@/lib/auth/client-auth-user'

vi.mock(import('@/lib/api/client'), () => ({
  getPaginatedPage: vi.fn<VitestLooseMock>(),
}))

interface TestPage {
  items: string[]
  post_hacker_news_references?: Record<string, { story_count: number; comment_count: number }>
  page_info: { has_next_page: boolean; end_cursor: string | null }
}

function makePage(items: string[], endCursor: string | null, storyCount?: number): TestPage {
  return {
    items,
    ...(storyCount === undefined
      ? {}
      : {
          post_hacker_news_references: {
            [items[0]!]: { story_count: storyCount, comment_count: 0 },
          },
        }),
    page_info: { has_next_page: endCursor !== null, end_cursor: endCursor },
  }
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

  it('refreshes every retained page when the server acknowledges visible references', async () => {
    const initial = makePage(['first'], 'c1', 1)
    const second = makePage(['second'], null, 2)
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(second)
    let generation = 0
    const wrapper = ({ children }: { children: ReactNode }) => (
      <HackerNewsReferenceRefreshGenerationContext.Provider value={generation}>
        {children}
      </HackerNewsReferenceRefreshGenerationContext.Provider>
    )
    const { result, rerender } = renderHook(
      () => {
        const pagination = usePaginatedList(initial, '/api/v1/items', { q: 'a' })
        useHackerNewsReferenceRefresh(
          pagination.refreshLoadedPages,
          '/api/v1/items',
          { q: 'a' },
          pagination.fetchError,
          pagination.resetKey,
        )
        return pagination
      },
      { wrapper },
    )
    await act(async () => result.current.loadMore())

    const refreshedFirst = makePage(['first-refreshed'], 'c2', 3)
    const refreshedSecond = makePage(['second-refreshed'], null, 4)
    vi.mocked(getPaginatedPage)
      .mockResolvedValueOnce(refreshedFirst)
      .mockResolvedValueOnce(refreshedSecond)
    generation = 1
    await act(async () => rerender())

    expect(getPaginatedPage).toHaveBeenNthCalledWith(2, '/api/v1/items', {
      q: 'a',
    })
    expect(getPaginatedPage).toHaveBeenNthCalledWith(3, '/api/v1/items', {
      q: 'a',
      after: 'c2',
    })
    expect(result.current.pages).toEqual([refreshedFirst, refreshedSecond])
    expect(result.current.pages[0]?.post_hacker_news_references?.['first-refreshed']).toEqual({
      story_count: 3,
      comment_count: 0,
    })
  })

  it('keeps terminal pages on refresh failure and retries the full retained range', async () => {
    const initial = makePage(['first'], 'c1')
    const second = makePage(['second'], null)
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(second)
    let generation = 0
    const wrapper = ({ children }: { children: ReactNode }) => (
      <HackerNewsReferenceRefreshGenerationContext.Provider value={generation}>
        {children}
      </HackerNewsReferenceRefreshGenerationContext.Provider>
    )
    const { result, rerender } = renderHook(
      () => {
        const pagination = usePaginatedList(initial, '/api/v1/items', {})
        const referenceRefresh = useHackerNewsReferenceRefresh(
          pagination.refreshLoadedPages,
          '/api/v1/items',
          {},
          pagination.fetchError,
          pagination.resetKey,
        )
        return {
          ...pagination,
          retryReferenceRefresh: referenceRefresh.retry,
          handleLoadMore: referenceRefresh.handleLoadMore(pagination.loadMore),
        }
      },
      { wrapper },
    )
    await act(async () => result.current.loadMore())

    vi.mocked(getPaginatedPage).mockRejectedValueOnce(new Error('refresh failed'))
    generation = 1
    await act(async () => rerender())
    expect(result.current.pages).toEqual([initial, second])
    expect(result.current.fetchError).toBeInstanceOf(Error)

    const refreshedFirst = makePage(['first-refreshed'], 'c2', 3)
    const refreshedSecond = makePage(['second-refreshed'], 'c3', 4)
    vi.mocked(getPaginatedPage)
      .mockResolvedValueOnce(refreshedFirst)
      .mockResolvedValueOnce(refreshedSecond)
    await act(async () => result.current.retryReferenceRefresh())

    expect(result.current.pages).toEqual([refreshedFirst, refreshedSecond])
    expect(result.current.pages[0]?.post_hacker_news_references?.['first-refreshed']).toEqual({
      story_count: 3,
      comment_count: 0,
    })
    expect(result.current.fetchError).toBeNull()

    vi.mocked(getPaginatedPage).mockRejectedValueOnce(new Error('next page failed'))
    await act(async () => result.current.handleLoadMore())
    expect(getPaginatedPage).toHaveBeenLastCalledWith('/api/v1/items', { after: 'c3' })
    expect(result.current.fetchError).toBeInstanceOf(Error)
  })

  it('drops a pending viewer refresh when the authenticated actor changes', async () => {
    const initial = makePage(['first'], null, 1)
    const viewerBPage = makePage(['first-for-viewer-b'], null, 2)
    let actor = 'viewer-a'
    const viewers = Object.fromEntries(
      ['viewer-a', 'viewer-b'].map(id => [
        id,
        {
          currentUser: { id, roles: [], account_type: null } as ClientAuthUser,
          isAuthenticated: true,
        },
      ]),
    )
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={viewers[actor]}>{children}</AuthContext.Provider>
    )
    const { result, rerender } = renderHook(() => usePaginatedList(initial, '/api/v1/items', {}), {
      wrapper,
    })
    let resolveViewerARefresh!: (page: TestPage) => void
    const viewerARefresh = new Promise<TestPage>(resolve => {
      resolveViewerARefresh = resolve
    })
    act(() => {
      void result.current.refreshLoadedPages(() => viewerARefresh)
    })

    vi.mocked(getPaginatedPage).mockResolvedValueOnce(viewerBPage)
    actor = 'viewer-b'
    await act(async () => rerender())
    expect(result.current.pages).toEqual([viewerBPage])

    await act(async () => {
      resolveViewerARefresh(makePage(['stale-for-viewer-a'], null, 99))
      await viewerARefresh
    })
    expect(result.current.pages).toEqual([viewerBPage])
    expect(result.current.pages[0]?.post_hacker_news_references?.['first-for-viewer-b']).toEqual({
      story_count: 2,
      comment_count: 0,
    })
  })

  it('cancels custom-loader pages on actor changes without inventing a first-page endpoint', async () => {
    const initial = makePage(['first'], 'next')
    const viewers = [null, { id: 'viewer-b', roles: [], account_type: null } as ClientAuthUser]
    const contexts = viewers.map(currentUser => ({
      currentUser,
      isAuthenticated: currentUser !== null,
    }))
    let actor = 0
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={contexts[actor]}>{children}</AuthContext.Provider>
    )
    let resolvePage!: (value: TestPage) => void
    const pending = new Promise<TestPage>(resolve => {
      resolvePage = resolve
    })
    const loadPage = vi.fn<(cursor: string) => Promise<TestPage>>().mockReturnValue(pending)
    const { result, rerender } = renderHook(() => usePaginatedList(initial, '', {}, { loadPage }), {
      wrapper,
    })
    // The adapter also supports custom loaders with a logical endpoint.
    const logical = renderHook(
      () => usePaginatedList(initial, '/custom-source', {}, { loadPage }),
      { wrapper },
    )
    act(() => {
      void logical.result.current.loadMore()
    })
    actor = 1
    await act(async () => {
      rerender()
      logical.rerender()
    })
    await act(async () => {
      resolvePage(makePage(['stale'], null))
      await pending
    })
    expect(result.current.pages).toEqual([initial])
    expect(logical.result.current.pages).toEqual([initial])
    expect(getPaginatedPage).not.toHaveBeenCalled()
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
