import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
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
  mockResolveCommunityModerationReport,
  mockUnpublishCommunityPost,
  mockUsePaginatedList,
  mockGetExposureState,
  mockRecordMediaReveal,
} = vi.hoisted(() => ({
  mockApprovePost: vi.fn<VitestLooseMock>(),
  mockResolveCommunityModerationReport: vi.fn<VitestLooseMock>(),
  mockUnpublishCommunityPost: vi.fn<VitestLooseMock>(),
  mockUsePaginatedList: vi.fn<VitestLooseMock>(),
  mockGetExposureState: vi.fn<VitestLooseMock>(),
  mockRecordMediaReveal: vi.fn<VitestLooseMock>(),
}))
vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)
vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        children,
        onValueChange,
        value,
      }: {
        children: ReactNode
        onValueChange: (value: string) => void
        value: string
      }) => (
        <select
          aria-label='Sort reports'
          value={value}
          onChange={event => onValueChange(event.currentTarget.value)}
        >
          {children}
        </select>
      ),
      SelectContent: ({ children }: { children: ReactNode }) => children,
      SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
        <option value={value}>{children}</option>
      ),
      SelectTrigger: ({ children }: { children: ReactNode }) => children,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)
vi.mock(import('@/hooks/use-paginated-list'), () => ({
  usePaginatedList: mockUsePaginatedList,
}))
vi.mock(import('@/lib/api/client'), () => ({
  approvePost: mockApprovePost,
  rejectPost: vi.fn<VitestLooseMock>(),
  unpublishCommunityPost: mockUnpublishCommunityPost,
}))
vi.mock(import('@/lib/api/client/reports'), () => ({
  resolveCommunityModerationReport: mockResolveCommunityModerationReport,
}))
vi.mock(import('@/lib/api/client/moderation-exposure'), () => ({
  getExposureState: mockGetExposureState,
  recordMediaReveal: mockRecordMediaReveal,
}))

import { ModQueue } from './mod-queue'
import { initialModQueueState, modQueueReducer } from './mod-queue-state'

describe('ModQueue', () => {
  const neutralExposure = { count: 0, threshold: 10, in_cooldown: false, cooldown_ends_at: null }

  beforeEach(() => {
    mockNav.reset()
    mockGetExposureState.mockResolvedValue({ exposure: neutralExposure })
    mockRecordMediaReveal.mockResolvedValue({ exposure: neutralExposure })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('resolves a community report and removes it from the queue', async () => {
    mockUsePaginatedList.mockReturnValue(makePaginatedListState(makePostsResponse()))
    mockResolveCommunityModerationReport.mockResolvedValueOnce(undefined)

    render(
      <ModQueue
        data={makePostsResponse()}
        reportsData={makeReportsResponse()}
        communitySlug='credit-cards'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reviewed' }))

    await waitFor(() => expect(screen.queryByText('Reported post')).not.toBeInTheDocument())
    expect(mockResolveCommunityModerationReport).toHaveBeenCalledWith(
      'credit-cards',
      'report-1',
      'reviewed',
    )
  })

  it('renders SLA and report-count badges for community reports', () => {
    mockUsePaginatedList.mockReturnValue(makePaginatedListState(makePostsResponse()))

    const { container } = render(
      <ModQueue
        data={makePostsResponse()}
        reportsData={makeReportsResponse({ reports: [makeReport({ report_count: 2 })] })}
        communitySlug='credit-cards'
      />,
    )

    expect(container.querySelector('[data-pw="moderation-sla-badge"]')).not.toBeNull()
    expect(screen.getByText('2 reports')).toBeVisible()
  })

  it('updates the report sort URL parameter', () => {
    mockUsePaginatedList.mockReturnValue(makePaginatedListState(makePostsResponse()))
    window.history.pushState(
      {},
      '',
      '/communities/credit-cards/settings/moderation?tab=moderation&reportSort=created_at_desc',
    )

    render(
      <ModQueue
        data={makePostsResponse()}
        reportsData={makeReportsResponse()}
        communitySlug='credit-cards'
        reportSort='created_at_desc'
      />,
    )

    expect(screen.getByLabelText('Sort reports')).toHaveValue('created_at_desc')
    expect(screen.queryByRole('option', { name: 'Severity' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Sort reports'), { target: { value: 'most_reported' } })

    expect(mockNav.push).toHaveBeenCalledWith('?tab=moderation&reportSort=most_reported', {
      scroll: false,
    })
  })

  it('approves and removes a pending post from accumulated pages', async () => {
    mockUsePaginatedList.mockReturnValue(makePaginatedListState(makePostsResponse()))
    mockApprovePost.mockResolvedValueOnce(undefined)

    render(
      <ModQueue
        data={makePostsResponse()}
        reportsData={{ reports: [] }}
        communitySlug='credit-cards'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull())
    expect(mockApprovePost).toHaveBeenCalledWith('credit-cards', 'post-1')
    expect(mockNav.refresh).toHaveBeenCalledOnce()
  })

  it('renders report note for site staff when present', () => {
    mockUsePaginatedList.mockReturnValue(makePaginatedListState(makePostsResponse()))

    render(
      <ModQueue
        data={makePostsResponse()}
        reportsData={makeReportsResponse({
          reports: [makeReport({ note: 'Internal note for moderators.' })],
        })}
        communitySlug='credit-cards'
        isStaff
      />,
    )

    expect(screen.getByText('Internal note for moderators.')).toBeVisible()
  })

  it('shows the empty state when there are no posts or reports', () => {
    mockUsePaginatedList.mockReturnValue(makePaginatedListState(makeEmptyPostsResponse()))

    render(
      <ModQueue
        data={makeEmptyPostsResponse()}
        communitySlug='credit-cards'
      />,
    )

    expect(screen.getByText('No posts or reports pending review.')).toBeVisible()
  })
})

describe('modQueueReducer', () => {
  it('handles every queue action', () => {
    let state = modQueueReducer(initialModQueueState, { type: 'start', id: 'post-1' })
    expect(state.loading).toBe('post-1')

    state = modQueueReducer(state, { type: 'reject-started', postId: 'post-1' })
    expect(state.activeAction).toEqual({ postId: 'post-1', type: 'reject' })

    state = modQueueReducer(state, { type: 'reject-reason-changed', value: 'No thanks' })
    expect(state.rejectionReason).toBe('No thanks')

    state = modQueueReducer(state, { type: 'report-resolved', reportId: 'report-1' })
    expect(state.resolvedReportIds.has('report-1')).toBe(true)

    state = modQueueReducer(state, { type: 'post-resolved', postId: 'post-1' })
    expect(state.resolvedPostIds.has('post-1')).toBe(true)

    state = modQueueReducer(state, { type: 'fail', message: 'Nope' })
    expect(state.error).toBe('Nope')

    state = modQueueReducer(state, { type: 'reject-cancelled' })
    expect(state.activeAction).toBeNull()

    state = modQueueReducer(state, { type: 'stop' })
    expect(state.loading).toBeNull()
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
