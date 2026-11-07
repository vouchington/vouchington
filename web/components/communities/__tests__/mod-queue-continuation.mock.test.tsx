import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from 'vouchington-tooling/next-navigation-mock'
import type { CommunityPostsResponseBody } from '@/types/api-responses'

const mockNav = createNavMock()

const { mockUsePaginatedList } = vi.hoisted(() => ({
  mockUsePaginatedList: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/hooks/use-paginated-list'), () => ({
  usePaginatedList: mockUsePaginatedList,
}))

vi.mock(import('@/lib/api/client'), () => ({
  approvePost: vi.fn<VitestLooseMock>(),
  rejectPost: vi.fn<VitestLooseMock>(),
  unpublishCommunityPost: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/reports'), () => ({
  resolveCommunityModerationReport: vi.fn<VitestLooseMock>(),
}))

import { ModQueue } from '../mod-queue'

const emptyPosts = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  posts: {},
  posts_metrics: {},
} as CommunityPostsResponseBody

describe('ModQueue pending-post continuation', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
  })

  it('loads the next page when the current pending-post page is empty', () => {
    const loadMore = vi.fn<() => Promise<void>>(async () => {})
    mockUsePaginatedList.mockReturnValue({
      pages: [emptyPosts],
      hasNextPage: true,
      endCursor: 'cursor-1',
      loadMore,
      loadingMore: false,
      fetchError: null,
      clearError: vi.fn<() => void>(),
      resetKey: 0,
    })

    render(
      <ModQueue
        data={emptyPosts}
        communitySlug='credit-cards'
        activeTab='posts'
        activeTabIsExplicit
      />,
    )

    expect(screen.getByText('No pending posts.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(loadMore).toHaveBeenCalledOnce()
  })
})
