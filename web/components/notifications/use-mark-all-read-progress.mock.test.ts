import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { getPaginatedPage } from '@/lib/api/client'
import { getMyUnreadNotificationsSummaryClient } from '@/lib/api/client/my'
import type {
  NotificationsResponseBody,
  NotificationsUnreadSummaryResponseBody,
} from '@/types/api-responses'
import { useMarkAllReadProgress } from './use-mark-all-read-progress'

vi.mock(import('@/lib/api/client'), () => ({ getPaginatedPage: vi.fn<VitestLooseMock>() }))
vi.mock(import('@/lib/api/client/my'), () => ({
  getMyUnreadNotificationsSummaryClient: vi.fn<VitestLooseMock>(),
}))

const page: NotificationsResponseBody = {
  results: [],
  notifications: {},
  communities: {},
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
}
const summary = (unread_count: number): NotificationsUnreadSummaryResponseBody => ({
  unread_count,
  results: [],
  notifications: {},
  communities: {},
})

describe('useMarkAllReadProgress', () => {
  it('revalidates one page on request and focus, then stops when unread count reaches zero', async () => {
    const resetToFirstPage = vi.fn<(page: NotificationsResponseBody) => void>()
    const refreshedPage = { ...page, page_info: { ...page.page_info, end_cursor: 'fresh' } }
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(page).mockResolvedValueOnce(refreshedPage)
    vi.mocked(getMyUnreadNotificationsSummaryClient)
      .mockResolvedValueOnce(summary(1))
      .mockResolvedValueOnce(summary(0))

    const { result } = renderHook(() => useMarkAllReadProgress(resetToFirstPage))
    act(() => result.current.setReadAllPending(true))
    await act(async () => {
      await result.current.refreshReadState()
    })
    expect(result.current.readAllPending).toBe(true)
    expect(result.current.refreshingReadState).toBe(false)
    expect(resetToFirstPage).toHaveBeenCalledWith(page)

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(result.current.readAllPending).toBe(false)
    expect(resetToFirstPage).toHaveBeenLastCalledWith(refreshedPage)
    expect(getPaginatedPage).toHaveBeenCalledTimes(2)
    expect(getPaginatedPage).toHaveBeenCalledWith('/api/v1/my/notifications', {})
    expect(getMyUnreadNotificationsSummaryClient).toHaveBeenCalledTimes(2)
    window.dispatchEvent(new Event('focus'))
    expect(getPaginatedPage).toHaveBeenCalledTimes(2)
  })
})
