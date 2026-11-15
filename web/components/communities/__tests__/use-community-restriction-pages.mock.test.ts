import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommunityRestrictionsResponseBody } from '@/types/api-responses'

const { mockGetPage, mockOnError } = vi.hoisted(() => ({
  mockGetPage: vi.fn<(...args: unknown[]) => Promise<CommunityRestrictionsResponseBody>>(),
  mockOnError: vi.fn<typeof import('@/lib/on-error').default>(),
}))
vi.mock(import('@/lib/api/client/community-restrictions'), () => ({
  getCommunityRestrictionPage: mockGetPage,
  activateCommunityRestrictions:
    vi.fn<typeof import('@/lib/api/client/community-restrictions').activateCommunityRestrictions>(),
  liftCommunityRestriction:
    vi.fn<typeof import('@/lib/api/client/community-restrictions').liftCommunityRestriction>(),
}))
vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
  onSuccess: vi.fn<typeof import('@/lib/on-error').onSuccess>(),
}))
import { useCommunityRestrictionPages } from '../use-community-restriction-pages'

const initialData: CommunityRestrictionsResponseBody = {
  results: [],
  community_restrictions: {},
  page_info: { has_next_page: true, start_cursor: null, end_cursor: 'initial-cursor' },
  raid_mode_suggestion: { velocity_spike: false, flag_count: 0, latest_flagged_at: null },
}
const staleData: CommunityRestrictionsResponseBody = {
  ...initialData,
  results: [{ __entity_type: 'community_restriction', id: 'stale-restriction' }],
  page_info: { has_next_page: false, start_cursor: 'stale-cursor', end_cursor: null },
}

describe('restriction request generations', () => {
  beforeEach(() => vi.clearAllMocks())

  it('discards a continuation response after a restriction reset', async () => {
    const stale = Promise.withResolvers<CommunityRestrictionsResponseBody>()
    mockGetPage.mockReturnValueOnce(stale.promise)
    const { result } = renderHook(() => useCommunityRestrictionPages('community', initialData))
    let request: Promise<void>
    act(() => {
      request = result.current.load('active', 'initial-cursor')
    })
    act(() => result.current.resetRestrictions())
    await act(async () => {
      stale.resolve(staleData)
      await request
    })
    expect(result.current.visibleData).toBe(initialData)
    expect(result.current.status).toBe('active')
    expect(result.current.isLoading).toBe(false)
  })

  it('ignores an old failure and finally callback while the new generation is loading', async () => {
    const stale = Promise.withResolvers<CommunityRestrictionsResponseBody>()
    const current = Promise.withResolvers<CommunityRestrictionsResponseBody>()
    mockGetPage.mockReturnValueOnce(stale.promise).mockReturnValueOnce(current.promise)
    const { result } = renderHook(() => useCommunityRestrictionPages('community', initialData))
    let oldRequest: Promise<void>
    let currentRequest: Promise<void>
    act(() => {
      oldRequest = result.current.load('past')
    })
    act(() => result.current.resetRestrictions())
    act(() => {
      currentRequest = result.current.load('active')
    })
    await act(async () => {
      stale.reject(new Error('stale failure'))
      await oldRequest
    })
    expect(result.current.isLoading).toBe(true)
    expect(mockOnError).not.toHaveBeenCalled()
    await act(async () => {
      await result.current.load('past')
    })
    expect(mockGetPage).toHaveBeenCalledTimes(2)
    await act(async () => {
      current.resolve(initialData)
      await currentRequest
    })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.visibleData).toBe(initialData)
  })

  it('invalidates a pending read when the server refresh supplies a new initial page', async () => {
    const stale = Promise.withResolvers<CommunityRestrictionsResponseBody>()
    mockGetPage.mockReturnValueOnce(stale.promise)
    const { result, rerender } = renderHook(
      ({ data }) => useCommunityRestrictionPages('community', data),
      {
        initialProps: { data: initialData },
      },
    )
    let request: Promise<void>
    act(() => {
      request = result.current.load('past')
    })
    const refreshed = {
      ...initialData,
      page_info: { ...initialData.page_info, end_cursor: 'refreshed-cursor' },
    }
    rerender({ data: refreshed })
    await act(async () => {
      stale.resolve(staleData)
      await request
    })
    expect(result.current.visibleData).toBe(refreshed)
    expect(result.current.status).toBe('active')
    expect(result.current.isLoading).toBe(false)
  })

  it('preserves error reporting for a failure in the current generation', async () => {
    const failure = new Error('current failure')
    mockGetPage.mockRejectedValueOnce(failure)
    const { result } = renderHook(() => useCommunityRestrictionPages('community', initialData))
    await act(async () => {
      await result.current.load('past')
    })
    expect(mockOnError).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({
        tags: { form: 'community-restrictions' },
      }),
    )
    expect(result.current.isLoading).toBe(false)
  })
})
