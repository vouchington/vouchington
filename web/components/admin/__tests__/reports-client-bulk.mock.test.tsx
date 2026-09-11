import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'

const mockNav = createNavMock()

const { mockDeletePost, mockResolveModerationReport } = vi.hoisted(() => ({
  mockDeletePost: vi.fn<VitestLooseMock>(),
  mockResolveModerationReport: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/posts'), () => ({
  deletePost: mockDeletePost,
}))

vi.mock(import('@/lib/api/client/reports'), () => ({
  resolveModerationReport: mockResolveModerationReport,
  rerunReportJudgement: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
  onSuccess: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

import {
  ReportsClient,
  type AdminModerationReport,
  type AdminModerationReportsResponse,
} from '../reports-client'

describe('ReportsClient bulk actions', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
  })

  it('renders selection controls only for staff reports', () => {
    const { rerender } = render(
      <ReportsClient
        viewerTier='staff'
        data={makeReportsResponse()}
      />,
    )

    expect(
      screen.getByRole('checkbox', { name: /select reported post report/i }),
    ).toBeInTheDocument()

    rerender(
      <ReportsClient
        viewerTier='member'
        data={{
          results: [
            {
              id: 'report-m1',
              case_id: 'case-m1',
              created_at: '2026-05-31T00:00:00.000Z',
              reviewed_at: null,
              entity_type: 'post',
              entity_id: 'post-1',
              target_content: null,
              target_label: 'A post',
              target_path: null,
              target_available: true,
              reason: 'spam',
              status: 'pending',
              report_count: 1,
              post_moderation_context: null,
            },
          ],
          page_info: {
            has_next_page: false,
            has_previous_page: false,
            start_cursor: null,
            end_cursor: null,
          },
        }}
      />,
    )

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('bulk dismisses selected pending reports', async () => {
    mockResolveModerationReport.mockResolvedValueOnce(undefined)
    render(
      <ReportsClient
        viewerTier='staff'
        data={makeReportsResponse()}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: /select reported post report/i }))
    let toolbar = getBulkToolbar()
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Dismiss' }))
    toolbar = getBulkToolbar()
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(mockResolveModerationReport).toHaveBeenCalledWith('report-1', 'dismissed'),
    )
    await waitFor(() => expect(screen.queryByText('Reported post')).not.toBeInTheDocument())
  })

  it('bulk removes selected pending post reports and skips unsupported or closed reports', async () => {
    mockDeletePost.mockResolvedValueOnce(undefined)
    mockResolveModerationReport.mockResolvedValueOnce(undefined)
    render(
      <ReportsClient
        viewerTier='staff'
        data={{
          results: [
            makeReport({ id: 'report-post', entity_id: 'post-1', target_label: 'Reported post' }),
            makeReport({
              id: 'report-user',
              entity_type: 'user',
              entity_id: 'user-1',
              target_label: '@spammer',
            }),
            makeReport({
              id: 'report-reviewed',
              status: 'reviewed',
              entity_id: 'post-2',
              target_label: 'Reviewed post',
            }),
          ],
          page_info: {
            has_next_page: false,
            has_previous_page: false,
            start_cursor: null,
            end_cursor: null,
          },
        }}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: /select reported post report/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /select @spammer report/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /select reviewed post report/i }))
    let toolbar = getBulkToolbar()
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Remove' }))
    toolbar = getBulkToolbar()
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(mockDeletePost).toHaveBeenCalledWith('post-1'))
    expect(mockResolveModerationReport).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByText('Reported post')).not.toBeInTheDocument())
    expect(screen.getByText('@spammer')).toBeVisible()
    expect(screen.getByText('Reviewed post')).toBeVisible()
    expect(screen.getByText('1 succeeded, 2 skipped')).toBeVisible()
  })

  it('skips system-generated reports without ban-evasion context for every bulk action', async () => {
    render(
      <ReportsClient
        viewerTier='staff'
        data={makeReportsResponse({ is_system_generated: true })}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: /select reported post report/i }))
    for (const action of ['Dismiss', 'Remove']) {
      let toolbar = getBulkToolbar()
      fireEvent.click(within(toolbar).getByRole('button', { name: action }))
      toolbar = getBulkToolbar()
      fireEvent.click(within(toolbar).getByRole('button', { name: 'Confirm' }))
      await waitFor(() => expect(screen.getByText(/1 skipped/)).toBeVisible())
    }

    expect(mockResolveModerationReport).not.toHaveBeenCalled()
    expect(mockDeletePost).not.toHaveBeenCalled()
  })

  it('dedupes bulk remove target deletion for duplicate report targets', async () => {
    mockDeletePost.mockResolvedValue(undefined)
    mockResolveModerationReport.mockResolvedValue(undefined)
    render(
      <ReportsClient
        viewerTier='staff'
        data={{
          results: [
            makeReport({ id: 'report-a', entity_id: 'post-1', target_label: 'First report' }),
            makeReport({ id: 'report-b', entity_id: 'post-1', target_label: 'Second report' }),
          ],
          page_info: {
            has_next_page: false,
            has_previous_page: false,
            start_cursor: null,
            end_cursor: null,
          },
        }}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: /select first report report/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /select second report report/i }))
    let toolbar = getBulkToolbar()
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Remove' }))
    toolbar = getBulkToolbar()
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(mockDeletePost).toHaveBeenCalledTimes(1))
    expect(mockDeletePost).toHaveBeenCalledWith('post-1')
    expect(mockResolveModerationReport).not.toHaveBeenCalled()
  })

  it('disables bulk remove for staff without delete permission', () => {
    render(
      <ReportsClient
        viewerTier='staff'
        canBulkRemove={false}
        data={makeReportsResponse()}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: /select reported post report/i }))

    expect(within(getBulkToolbar()).getByRole('button', { name: 'Remove' })).toBeDisabled()
  })

  it('clears bulk selection when a selected report is individually resolved', async () => {
    mockResolveModerationReport.mockResolvedValueOnce(undefined)
    render(
      <ReportsClient
        viewerTier='staff'
        data={makeReportsResponse()}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: /select reported post report/i }))
    expect(screen.getByText('1 item selected')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /mark reported post report reviewed/i }))

    await waitFor(() =>
      expect(mockResolveModerationReport).toHaveBeenCalledWith('report-1', 'reviewed'),
    )
    await waitFor(() => expect(screen.queryByText('1 item selected')).not.toBeInTheDocument())
  })
})

function getBulkToolbar(): HTMLElement {
  return screen.getByText(/\d+ item(?:s)? selected/).parentElement!.parentElement!
}

function makeReportsResponse(
  overrides: Partial<AdminModerationReport> = {},
): AdminModerationReportsResponse {
  return {
    results: [makeReport(overrides)],
    page_info: {
      has_next_page: false,
      has_previous_page: false,
      start_cursor: null,
      end_cursor: null,
    },
  }
}

function makeReport(overrides: Partial<AdminModerationReport> = {}): AdminModerationReport {
  return {
    id: 'report-1',
    case_id: 'case-1',
    created_at: '2026-05-31T00:00:00.000Z',
    reviewed_at: null,
    reporter_user_id: 'user-1',
    reporter_username: 'reader',
    entity_type: 'post',
    entity_id: 'post-1',
    admin_action_path: '/discussion/reported-post',
    target_label: 'Reported post',
    target_path: '/discussion/reported-post',
    target_user_id: null,
    target_available: true,
    target_is_restricted: false,
    reason: 'spam',
    note: null,
    status: 'pending',
    report_count: 1,
    resolved_by_id: null,
    is_system_generated: false,
    judgement: null,
    post_moderation_context: null,
    ...overrides,
    target_content: overrides.target_content ?? null,
  }
}
