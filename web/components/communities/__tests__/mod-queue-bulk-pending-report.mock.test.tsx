import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'
import type {
  CommunityModerationReport,
  CommunityModerationReportsResponseBody,
  CommunityPostsResponseBody,
} from '@/types/api-responses'

const mockNav = createNavMock()

const {
  mockDeletePost,
  mockRejectPost,
  mockResolveCommunityModerationReport,
  mockUnpublishCommunityPost,
  mockUsePaginatedList,
} = vi.hoisted(() => ({
  mockDeletePost: vi.fn<VitestLooseMock>(),
  mockRejectPost: vi.fn<VitestLooseMock>(),
  mockResolveCommunityModerationReport: vi.fn<VitestLooseMock>(),
  mockUnpublishCommunityPost: vi.fn<VitestLooseMock>(),
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
  rejectPost: mockRejectPost,
  unpublishCommunityPost: mockUnpublishCommunityPost,
}))

vi.mock(import('@/lib/api/client/posts'), () => ({
  deletePost: mockDeletePost,
}))

vi.mock(import('@/lib/api/client/reports'), () => ({
  resolveCommunityModerationReport: mockResolveCommunityModerationReport,
}))

import { ModQueue } from '../mod-queue'

describe('ModQueue bulk pending report actions', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
  })

  it('rejects a reported pending post even when it is absent from the loaded post page', async () => {
    mockUsePaginatedList.mockReturnValue(makePaginatedListState(makeEmptyPostsResponse()))
    mockRejectPost.mockResolvedValueOnce(undefined)
    mockResolveCommunityModerationReport.mockResolvedValueOnce(undefined)

    render(
      <ModQueue
        data={makeEmptyPostsResponse()}
        reportsData={makeReportsResponse()}
        communitySlug='credit-cards'
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: /select report for pending report/i }))
    let toolbar = getBulkToolbar()
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Remove' }))
    toolbar = getBulkToolbar()
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(mockRejectPost).toHaveBeenCalledWith('credit-cards', 'post-not-loaded', ''),
    )
    expect(mockUnpublishCommunityPost).not.toHaveBeenCalled()
    expect(mockResolveCommunityModerationReport).toHaveBeenCalledWith(
      'credit-cards',
      'report-1',
      'reviewed',
    )
  })

  it('removes the rejected post when resolving its report subsequently fails', async () => {
    const posts = makePostsResponse()
    mockUsePaginatedList.mockReturnValue(makePaginatedListState(posts))
    mockRejectPost.mockResolvedValueOnce(undefined)
    mockResolveCommunityModerationReport.mockRejectedValueOnce(new Error('resolution failed'))
    render(
      <ModQueue
        data={posts}
        reportsData={makeReportsResponse()}
        communitySlug='credit-cards'
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: /select report for pending report/i }))
    let toolbar = getBulkToolbar()
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Remove' }))
    toolbar = getBulkToolbar()
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(mockResolveCommunityModerationReport).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByText('Pending post')).not.toBeInTheDocument())
  })
})

function makePaginatedListState(data: CommunityPostsResponseBody) {
  return {
    pages: [data],
    hasNextPage: false,
    endCursor: null,
    loadMore: vi.fn<() => void>(),
    fetchError: null,
    clearError: vi.fn<() => void>(),
  }
}

function getBulkToolbar(): HTMLElement {
  return screen.getByText(/\d+ item(?:s)? selected/).parentElement!.parentElement!
}

function makeEmptyPostsResponse(): CommunityPostsResponseBody {
  return {
    results: [],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    posts: {},
    posts_metrics: {},
  }
}

function makePostsResponse(): CommunityPostsResponseBody {
  const post = {
    id: 'post-not-loaded',
    title: 'Pending post',
    markdown: 'Please review this.',
    created_at: '2026-05-31T00:00:00.000Z',
  } as CommunityPostsResponseBody['posts'][string]
  return {
    results: [{ __entity_type: 'post', id: post.id }],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    posts: { [post.id]: post },
    posts_metrics: {},
  }
}

function makeReportsResponse(): CommunityModerationReportsResponseBody {
  return {
    reports: [
      makeReport({
        entity_id: 'post-not-loaded',
        target_label: 'Pending report off page',
        target_pending_community_review: true,
      }),
    ],
  }
}

function makeReport(overrides: Partial<CommunityModerationReport>): CommunityModerationReport {
  return {
    id: 'report-1',
    created_at: '2026-05-31T00:00:00.000Z',
    reviewed_at: null,
    entity_type: 'post',
    entity_id: 'post-1',
    admin_action_path: '/discussion/reported-post',
    target_label: 'Reported post',
    target_path: '/discussion/reported-post',
    target_pending_community_review: false,
    reason: 'spam',
    note: null,
    status: 'pending',
    report_count: 1,
    resolved_by_id: null,
    ...overrides,
    target_content: overrides.target_content ?? null,
  }
}
