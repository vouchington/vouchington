import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'
import type {
  CommunityModerationReport,
  CommunityModerationReportsResponseBody,
  CommunityPostsResponseBody,
} from '@/types/api-responses'

const mockNav = createNavMock()

const {
  mockApprovePost,
  mockRejectPost,
  mockResolveCommunityModerationReport,
  mockUnpublishCommunityPost,
  mockUsePaginatedList,
} = vi.hoisted(() => ({
  mockApprovePost: vi.fn<VitestLooseMock>(),
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
  approvePost: mockApprovePost,
  rejectPost: mockRejectPost,
  unpublishCommunityPost: mockUnpublishCommunityPost,
}))

vi.mock(import('@/lib/api/client/reports'), () => ({
  resolveCommunityModerationReport: mockResolveCommunityModerationReport,
}))

import { ModQueue } from '../mod-queue'

describe('ModQueue keyboard shortcuts', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
  })

  it('navigates active items with j and k', async () => {
    mockUsePaginatedList.mockReturnValue(makePaginatedListState(makePostsResponse()))

    const { container } = render(
      <ModQueue
        data={makePostsResponse()}
        reportsData={makeReportsResponse()}
        communitySlug='credit-cards'
      />,
    )

    await waitFor(() =>
      expect(
        container.querySelector('[data-moderation-queue-key="report:report-1"]'),
      ).toHaveAttribute('data-active', 'true'),
    )

    fireEvent.keyDown(window, { key: 'j' })

    await waitFor(() =>
      expect(container.querySelector('[data-moderation-queue-key="post:post-1"]')).toHaveAttribute(
        'data-active',
        'true',
      ),
    )

    fireEvent.keyDown(window, { key: 'k' })

    await waitFor(() =>
      expect(
        container.querySelector('[data-moderation-queue-key="report:report-1"]'),
      ).toHaveAttribute('data-active', 'true'),
    )
  })

  it('defaults to visible ban-evasion reports even though they are not hotkeyable', () => {
    mockUsePaginatedList.mockReturnValue(makePaginatedListState(makePostsResponse()))
    const reportsData = makeReportsResponse()
    reportsData.reports[0] = makeReport({
      entity_type: 'user',
      entity_id: 'suspected-user',
      community_ban_evasion: {
        community_id: 'community-1',
        community_slug: 'credit-cards',
        source_user_id: 'source-user',
        source_username: 'source-user',
        score: 0.8,
        flagged_at: '2026-07-11T00:00:00.000Z',
      },
    })

    render(
      <ModQueue
        data={makePostsResponse()}
        reportsData={reportsData}
        communitySlug='credit-cards'
      />,
    )

    expect(screen.getByRole('tab', { name: 'Reports (1)' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('runs active-item post and report shortcuts', async () => {
    mockUsePaginatedList.mockReturnValue(makePaginatedListState(makePostsResponse()))
    mockResolveCommunityModerationReport.mockResolvedValueOnce(undefined)
    mockRejectPost.mockResolvedValueOnce(undefined)

    render(
      <ModQueue
        data={makePostsResponse()}
        reportsData={makeReportsResponse()}
        communitySlug='credit-cards'
      />,
    )

    fireEvent.keyDown(window, { key: 'r' })

    await waitFor(() =>
      expect(mockResolveCommunityModerationReport).toHaveBeenCalledWith(
        'credit-cards',
        'report-1',
        'reviewed',
      ),
    )
    await waitFor(() => expect(screen.queryByText('Reported post')).not.toBeInTheDocument())

    fireEvent.keyDown(window, { key: 'r' })

    await waitFor(() => expect(mockRejectPost).toHaveBeenCalledWith('credit-cards', 'post-1', ''))
  })

  it('toggles active item selection with x and opens scoped help with ?', async () => {
    mockUsePaginatedList.mockReturnValue(makePaginatedListState(makePostsResponse()))

    render(
      <ModQueue
        data={makePostsResponse()}
        reportsData={{ reports: [] }}
        communitySlug='credit-cards'
      />,
    )

    fireEvent.keyDown(window, { key: 'x' })

    expect(screen.getByText('1 item selected')).toBeVisible()

    fireEvent.keyDown(window, { key: '?' })

    expect(await screen.findByRole('heading', { name: 'Moderation Shortcuts' })).toBeVisible()
    expect(screen.getByText('Move to the next moderation queue item')).toBeVisible()
  })

  it('does not run shortcuts while typing in the rejection reason', () => {
    mockUsePaginatedList.mockReturnValue(makePaginatedListState(makePostsResponse()))

    render(
      <ModQueue
        data={makePostsResponse()}
        reportsData={{ reports: [] }}
        communitySlug='credit-cards'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.keyDown(screen.getByLabelText('Rejection reason'), { key: 'r' })

    expect(mockRejectPost).not.toHaveBeenCalled()
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

function makePostsResponse(): CommunityPostsResponseBody {
  const post = {
    id: 'post-1',
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
  return { reports: [makeReport()] }
}

function makeReport(overrides: Partial<CommunityModerationReport> = {}): CommunityModerationReport {
  return {
    id: 'report-1',
    created_at: '2026-05-31T00:00:00.000Z',
    reviewed_at: null,
    entity_type: 'post',
    entity_id: 'post-1',
    admin_action_path: '/discussion/reported-post',
    target_label: 'Reported post',
    target_path: '/discussion/reported-post',
    reason: 'spam',
    note: null,
    status: 'pending',
    report_count: 1,
    resolved_by_id: null,
    ...overrides,
    target_content: overrides.target_content ?? null,
  }
}
