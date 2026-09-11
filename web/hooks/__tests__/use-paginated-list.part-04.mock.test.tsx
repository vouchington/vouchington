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
})
