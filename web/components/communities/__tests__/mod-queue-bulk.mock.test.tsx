import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'
import type {
  CommunityModerationReport,
  CommunityModerationReportsResponseBody,
  CommunityPostsResponseBody,
} from '@/types/api-responses'

const mockNav = createNavMock()

const {
  mockApprovePost,
  mockDeletePost,
  mockRejectPost,
  mockResolveCommunityModerationReport,
  mockUnpublishCommunityPost,
  mockUsePaginatedList,
} = vi.hoisted(() => ({
  mockApprovePost: vi.fn<VitestLooseMock>(),
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
  approvePost: mockApprovePost,
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

describe('ModQueue bulk actions', () => {
  beforeEach(() => {
    mockNav.reset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('bulk dismisses selected community reports', async () => {
    mockUsePaginatedList.mockReturnValue(makePaginatedListState(makeEmptyPostsResponse()))
    mockResolveCommunityModerationReport.mockResolvedValueOnce(undefined)

    render(
      <ModQueue
        data={makeEmptyPostsResponse()}
        reportsData={makeReportsResponse()}
        communitySlug='credit-cards'
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: /select report for reported post/i }))

    const toolbar = getBulkToolbar()
    expect(within(toolbar).getByRole('button', { name: 'Ban user' })).toBeDisabled()
    expect(within(toolbar).getByRole('button', { name: 'Escalate' })).toBeDisabled()

    fireEvent.click(within(toolbar).getByRole('button', { name: 'Dismiss' }))
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(mockResolveCommunityModerationReport).toHaveBeenCalledWith(
        'credit-cards',
        'report-1',
        'dismissed',
      ),
    )
    await waitFor(() => expect(screen.queryByText('Reported post')).not.toBeInTheDocument())
  })

  it('bulk removes selected pending posts with a shared reason', async () => {
    mockUsePaginatedList.mockReturnValue(makePaginatedListState(makePostsResponse()))
    mockRejectPost.mockResolvedValueOnce(undefined)

    render(
      <ModQueue
        data={makePostsResponse()}
        reportsData={{ reports: [] }}
        communitySlug='credit-cards'
      />,
    )

    fireEvent.mouseDown(screen.getByRole('tab', { name: /posts/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /select pending post pending post/i }))
    let toolbar = getBulkToolbar()
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Remove' }))

    const reason = screen.getByLabelText('Bulk removal reason')
    const normalizedReason = 'x'.repeat(1000)
    fireEvent.change(reason, { target: { value: `  ${normalizedReason} extra  ` } })
    fireEvent.keyDown(reason, { key: 'x' })
    expect(
      screen.getByRole('checkbox', { name: /select pending post pending post/i }),
    ).toHaveAttribute('aria-checked', 'true')

    toolbar = getBulkToolbar()
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(mockRejectPost).toHaveBeenCalledWith('credit-cards', 'post-1', normalizedReason),
    )
    await waitFor(() => expect(mockNav.refresh).toHaveBeenCalled())
  })

  it('bulk removes selected published post and comment reports with scoped actions', async () => {
    mockUsePaginatedList.mockReturnValue(makePaginatedListState(makeEmptyPostsResponse()))
    mockUnpublishCommunityPost.mockResolvedValueOnce(undefined)
    mockDeletePost.mockResolvedValueOnce(undefined)
    mockResolveCommunityModerationReport.mockResolvedValue(undefined)

    render(
      <ModQueue
        data={makeEmptyPostsResponse()}
        reportsData={makeReportsResponse({
          reports: [
            makeReport({ id: 'report-post', entity_id: 'post-2', target_label: 'Published post' }),
            makeReport({
              id: 'report-comment',
              entity_type: 'comment',
              entity_id: 'comment-1',
              target_label: 'Reported comment',
            }),
          ],
        })}
        communitySlug='credit-cards'
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: /select report for published post/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /select report for reported comment/i }))
    let toolbar = getBulkToolbar()
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Remove' }))
    toolbar = getBulkToolbar()
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(mockUnpublishCommunityPost).toHaveBeenCalledWith('credit-cards', 'post-2'),
    )
    await waitFor(() => expect(mockDeletePost).toHaveBeenCalledWith('comment-1'))
    expect(mockResolveCommunityModerationReport).toHaveBeenCalledWith(
      'credit-cards',
      'report-post',
      'reviewed',
    )
    expect(mockResolveCommunityModerationReport).toHaveBeenCalledTimes(1)
  })

  it('dedupes bulk reject for duplicate reports against the same pending post', async () => {
    const pendingReport = (id: string, target_label: string) =>
      makeReport({ id, entity_id: 'post-1', target_label, target_pending_community_review: true })
    mockUsePaginatedList.mockReturnValue(makePaginatedListState(makePostsResponse()))
    mockRejectPost.mockResolvedValue(undefined)
    mockResolveCommunityModerationReport.mockResolvedValue(undefined)

    render(
      <ModQueue
        data={makePostsResponse()}
        reportsData={makeReportsResponse({
          reports: [
            pendingReport('report-a', 'First report'),
            pendingReport('report-b', 'Second report'),
          ],
        })}
        communitySlug='credit-cards'
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: /select report for first report/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /select report for second report/i }))
    let toolbar = getBulkToolbar()
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Remove' }))
    toolbar = getBulkToolbar()
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(mockResolveCommunityModerationReport).toHaveBeenCalledTimes(2))
    expect(mockRejectPost).toHaveBeenCalledTimes(1)
    expect(mockRejectPost).toHaveBeenCalledWith('credit-cards', 'post-1', '')
  })

  it('clears selection when selected items are individually moderated', async () => {
    mockUsePaginatedList.mockReturnValue(makePaginatedListState(makePostsResponse()))
    mockApprovePost.mockResolvedValueOnce(undefined)
    mockResolveCommunityModerationReport.mockResolvedValueOnce(undefined)

    render(
      <ModQueue
        data={makePostsResponse()}
        reportsData={makeReportsResponse({
          reports: [makeReport({ target_pending_community_review: true })],
        })}
        communitySlug='credit-cards'
      />,
    )

    fireEvent.mouseDown(screen.getByRole('tab', { name: /posts/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /select pending post pending post/i }))
    fireEvent.mouseDown(screen.getByRole('tab', { name: /reports/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /select report for reported post/i }))
    expect(screen.getByText('2 items selected')).toBeVisible()
    fireEvent.mouseDown(screen.getByRole('tab', { name: /posts/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(mockApprovePost).toHaveBeenCalledWith('credit-cards', 'post-1'))
    expect(screen.getByText('1 item selected')).toBeVisible()
    fireEvent.mouseDown(screen.getByRole('tab', { name: /reports/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Reviewed' }))
    await waitFor(() =>
      expect(mockResolveCommunityModerationReport).toHaveBeenCalledWith(
        'credit-cards',
        'report-1',
        'reviewed',
      ),
    )
    await waitFor(() => expect(screen.queryByText(/\d+ items? selected/)).not.toBeInTheDocument())
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
  return { results: [], page_info: emptyPageInfo(), posts: {}, posts_metrics: {} }
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

function makeReportsResponse(
  options: { reports?: CommunityModerationReport[] } = {},
): CommunityModerationReportsResponseBody {
  return { reports: options.reports ?? [makeReport()] }
}

function emptyPageInfo() {
  return { has_next_page: false, end_cursor: null, start_cursor: null }
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
