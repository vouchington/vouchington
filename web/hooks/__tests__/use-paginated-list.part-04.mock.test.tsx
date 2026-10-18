import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPaginatedPage } from '@/lib/api/client'
import { usePaginatedList } from '../use-paginated-list'

vi.mock(import('@/lib/api/client'), () => ({
  getPaginatedPage: vi.fn<VitestLooseMock>(),
}))

interface TestPage {
  items: string[]
  page_info: {
    has_next_page: boolean
    end_cursor: string | null
    start_cursor: string | null
  }
}

function makePage(items: string[], endCursor: string | null): TestPage {
  return {
    items,
    page_info: {
      has_next_page: endCursor !== null,
      end_cursor: endCursor,
      start_cursor: null,
    },
  }
}

describe('usePaginatedList loadMore start signal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves false and does not fetch when there is no next page', async () => {
    const initial = makePage(['only'], null)
    const { result } = renderHook(() => usePaginatedList(initial, '/api/v1/items', {}))

    let started!: void | boolean
    await act(async () => {
      started = await result.current.loadMore()
    })

    expect(started).toBe(false)
    expect(getPaginatedPage).not.toHaveBeenCalled()
    expect(result.current.pages).toEqual([initial])
  })

  it('refreshes every loaded cursor page before replacing the visible list', async () => {
    const initial = makePage(['first-old'], 'old-cursor')
    const second = makePage(['second-old'], null)
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(second)
    const { result } = renderHook(() => usePaginatedList(initial, '/api/v1/items', {}))
    await act(async () => {
      await result.current.loadMore()
    })
    expect(result.current.pages).toEqual([initial, second])

    const newFirst = makePage(['first-new'], 'new-cursor')
    const newSecond = makePage(['second-new'], null)
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(newSecond)
    await act(async () => {
      await result.current.refreshLoadedPages?.(async () => newFirst)
    })

    expect(getPaginatedPage).toHaveBeenLastCalledWith('/api/v1/items', { after: 'new-cursor' })
    expect(result.current.pages).toEqual([newFirst, newSecond])
  })

  it('keeps a page appended while a background refresh is in flight', async () => {
    const initial = makePage(['first-old'], 'cursor-1')
    const appended = makePage(['second'], null)
    const refreshed = makePage(['first-new'], 'cursor-1')
    const firstPage = Promise.withResolvers<TestPage>()
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(appended)
    const { result } = renderHook(() => usePaginatedList(initial, '/api/v1/items', {}))
    let refresh!: Promise<void>
    await act(async () => {
      refresh = result.current.refreshLoadedPages!(async () => firstPage.promise)
    })
    await act(async () => {
      await result.current.loadMore()
    })
    firstPage.resolve(refreshed)
    await act(async () => {
      await refresh
    })
    expect(result.current.pages).toEqual([refreshed, appended])
  })
})
