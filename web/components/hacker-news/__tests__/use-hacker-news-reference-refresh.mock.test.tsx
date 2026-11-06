import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { getPaginatedPage } from '@/lib/api/client'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { HackerNewsReferenceRefreshGenerationContext } from '../hacker-news-config-context'
import { useHackerNewsReferenceRefresh } from '../use-hacker-news-reference-refresh'

vi.mock(import('@/lib/api/client'), () => ({ getPaginatedPage: vi.fn<VitestLooseMock>() }))

function page(id: string, cursor: string | null = null) {
  return { items: [id], page_info: { has_next_page: cursor !== null, end_cursor: cursor } }
}
type Page = ReturnType<typeof page>

describe('retained reference refresh lifecycle', () => {
  beforeEach(() => vi.resetAllMocks())

  it('keeps a newer failed visibility refresh retryable after an older attempt completes', async () => {
    let generation = 0
    const initial = page('initial')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <HackerNewsReferenceRefreshGenerationContext.Provider value={generation}>
        {children}
      </HackerNewsReferenceRefreshGenerationContext.Provider>
    )
    const { result, rerender } = renderHook(
      () => {
        const pagination = usePaginatedList(initial, '/api/v1/items', {})
        const refresh = useHackerNewsReferenceRefresh(
          pagination.refreshLoadedPages,
          '/api/v1/items',
          {},
          pagination.fetchError,
          pagination.resetKey,
        )
        return { ...pagination, retry: refresh.handleLoadMore(pagination.loadMore) }
      },
      { wrapper },
    )
    let resolveOld!: (value: Page) => void
    let rejectNew!: (error: Error) => void
    const oldRequest = new Promise<Page>(resolve => {
      resolveOld = resolve
    })
    const newRequest = new Promise<Page>((_resolve, reject) => {
      rejectNew = reject
    })
    vi.mocked(getPaginatedPage).mockReturnValueOnce(oldRequest).mockReturnValueOnce(newRequest)
    generation = 1
    await act(async () => rerender())
    generation = 2
    await act(async () => rerender())
    await act(async () => {
      resolveOld(page('stale'))
      await oldRequest
    })
    await act(async () => {
      rejectNew(new Error('new refresh failed'))
      await newRequest.catch(() => {})
    })
    expect(result.current.pages).toEqual([initial])
    expect(result.current.fetchError).toBeInstanceOf(Error)
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(page('recovered'))
    await act(async () => result.current.retry())
    expect(result.current.pages).toEqual([page('recovered')])
    expect(getPaginatedPage).toHaveBeenCalledTimes(3)
  })

  it('drops pending refresh bookkeeping when the query resets before an ordinary continuation fails', async () => {
    let generation = 0
    let query = 'a'
    let initial = page('a')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <HackerNewsReferenceRefreshGenerationContext.Provider value={generation}>
        {children}
      </HackerNewsReferenceRefreshGenerationContext.Provider>
    )
    const { result, rerender } = renderHook(
      () => {
        const params = { q: query }
        const pagination = usePaginatedList(initial, '/api/v1/items', params)
        const refresh = useHackerNewsReferenceRefresh(
          pagination.refreshLoadedPages,
          '/api/v1/items',
          params,
          pagination.fetchError,
          pagination.resetKey,
        )
        return { ...pagination, retry: refresh.handleLoadMore(pagination.loadMore) }
      },
      { wrapper },
    )
    let resolveOld!: (value: Page) => void
    const oldRequest = new Promise<Page>(resolve => {
      resolveOld = resolve
    })
    vi.mocked(getPaginatedPage).mockReturnValueOnce(oldRequest)
    generation = 1
    await act(async () => rerender())
    query = 'b'
    initial = page('b', 'b-next')
    await act(async () => rerender())
    await act(async () => {
      resolveOld(page('stale'))
      await oldRequest
    })
    vi.mocked(getPaginatedPage).mockRejectedValueOnce(new Error('continuation failed'))
    await act(async () => result.current.loadMore())
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(page('b-second'))
    await act(async () => result.current.retry())
    expect(getPaginatedPage).toHaveBeenLastCalledWith('/api/v1/items', { q: 'b', after: 'b-next' })
    expect(result.current.pages).toEqual([initial, page('b-second')])
  })
})
