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
  return {
    items,
    page_info: { has_next_page: endCursor !== null, end_cursor: endCursor },
  }
}

describe('usePaginatedList inspected cursor continuation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('continues from inspected cursors across empty and short pages', async () => {
    const initial = makePage([], 'inspected-empty-tail')
    const shortPage = makePage(['visible-item'], 'inspected-short-tail')
    const finalPage = makePage([], null)
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(shortPage).mockResolvedValueOnce(finalPage)
    const { result } = renderHook(() => usePaginatedList(initial, '/api/v1/items', {}))

    await act(async () => result.current.loadMore())
    await act(async () => result.current.loadMore())

    expect(getPaginatedPage).toHaveBeenNthCalledWith(1, '/api/v1/items', {
      after: 'inspected-empty-tail',
    })
    expect(getPaginatedPage).toHaveBeenNthCalledWith(2, '/api/v1/items', {
      after: 'inspected-short-tail',
    })
    expect(result.current.pages).toEqual([initial, shortPage, finalPage])
    expect(result.current.hasNextPage).toBe(false)
  })
})
