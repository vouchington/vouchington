import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'

const mockNav = createNavMock()

const { mockResolveModerationReport, mockRerunReportJudgement, mockOnError, mockOnSuccess } =
  vi.hoisted(() => ({
    mockResolveModerationReport: vi.fn<VitestLooseMock>(),
    mockRerunReportJudgement: vi.fn<VitestLooseMock>(),
    mockOnError: vi.fn<VitestLooseMock>(),
    mockOnSuccess: vi.fn<VitestLooseMock>(),
  }))

vi.mock(import('@/lib/api/client/reports'), () => ({
  resolveModerationReport: mockResolveModerationReport,
  rerunReportJudgement: mockRerunReportJudgement,
}))

vi.mock(import('@/lib/on-error'), () => ({ default: mockOnError, onSuccess: mockOnSuccess }))

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

import {
  ReportsClient,
  type AdminModerationReport,
  type AdminModerationReportsResponse,
} from '../reports-client'

describe('ReportsClient keyboard shortcuts', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
  })

  it('navigates active staff reports with j and k', async () => {
    const { container } = render(
      <ReportsClient
        viewerTier='staff'
        data={makeReportsResponse([makeReport({ id: 'report-1' }), makeReport({ id: 'report-2' })])}
      />,
    )

    await waitFor(() =>
      expect(container.querySelector('[data-moderation-queue-key="report-1"]')).toHaveAttribute(
        'data-active',
        'true',
      ),
    )

    fireEvent.keyDown(window, { key: 'j' })

    await waitFor(() =>
      expect(container.querySelector('[data-moderation-queue-key="report-2"]')).toHaveAttribute(
        'data-active',
        'true',
      ),
    )

    fireEvent.keyDown(window, { key: 'k' })

    await waitFor(() =>
      expect(container.querySelector('[data-moderation-queue-key="report-1"]')).toHaveAttribute(
        'data-active',
        'true',
      ),
    )
  })

  it('keeps active focus at the same queue index when the active report is removed', async () => {
    const { container, rerender } = render(
      <ReportsClient
        viewerTier='staff'
        data={makeReportsResponse([
          makeReport({ id: 'report-1' }),
          makeReport({ id: 'report-2' }),
          makeReport({ id: 'report-3' }),
        ])}
      />,
    )

    fireEvent.keyDown(window, { key: 'j' })

    const secondReport = await waitFor(() => {
      const report = container.querySelector<HTMLElement>('[data-moderation-queue-key="report-2"]')
      if (!report) throw new Error('Expected report-2 to render')
      expect(report).toHaveAttribute('data-active', 'true')
      return report
    })
    secondReport.focus()
    expect(secondReport).toHaveFocus()

    rerender(
      <ReportsClient
        viewerTier='staff'
        data={makeReportsResponse([makeReport({ id: 'report-1' }), makeReport({ id: 'report-3' })])}
      />,
    )

    const thirdReport = await waitFor(() => {
      const report = container.querySelector<HTMLElement>('[data-moderation-queue-key="report-3"]')
      if (!report) throw new Error('Expected report-3 to render')
      expect(report).toHaveAttribute('data-active', 'true')
      return report
    })
    await waitFor(() => expect(thirdReport).toHaveFocus())
  })

  it('runs active report review and dismiss shortcuts for staff', async () => {
    mockResolveModerationReport.mockResolvedValue(undefined)
    const first = render(
      <ReportsClient
        viewerTier='staff'
        data={makeReportsResponse([makeReport({ id: 'report-1' })])}
      />,
    )

    fireEvent.keyDown(window, { key: 'r' })

    await waitFor(() =>
      expect(mockResolveModerationReport).toHaveBeenCalledWith('report-1', 'reviewed'),
    )

    first.unmount()
    mockResolveModerationReport.mockClear()

    render(
      <ReportsClient
        viewerTier='staff'
        data={makeReportsResponse([makeReport({ id: 'report-2' })])}
      />,
    )

    fireEvent.keyDown(window, { key: 'd' })

    await waitFor(() =>
      expect(mockResolveModerationReport).toHaveBeenCalledWith('report-2', 'dismissed'),
    )
  })

  it('does not run ordinary shortcuts for closed or system-generated reports', () => {
    const first = render(
      <ReportsClient
        viewerTier='staff'
        data={makeReportsResponse([makeReport({ status: 'reviewed' })])}
      />,
    )
    fireEvent.keyDown(window, { key: 'r' })
    fireEvent.keyDown(window, { key: 'd' })
    first.unmount()

    render(
      <ReportsClient
        viewerTier='staff'
        data={makeReportsResponse([makeReport({ is_system_generated: true })])}
      />,
    )
    fireEvent.keyDown(window, { key: 'r' })
    fireEvent.keyDown(window, { key: 'd' })

    expect(mockResolveModerationReport).not.toHaveBeenCalled()
  })

  it('toggles active report selection with x and opens scoped help with ?', async () => {
    render(
      <ReportsClient
        viewerTier='staff'
        data={makeReportsResponse([makeReport()])}
      />,
    )

    fireEvent.keyDown(window, { key: 'x' })

    expect(screen.getByText('1 item selected')).toBeVisible()

    fireEvent.keyDown(window, { key: '?' })

    expect(await screen.findByRole('heading', { name: 'Moderation Shortcuts' })).toBeVisible()
    expect(screen.getByText('Dismiss the active report')).toBeVisible()
  })

  it('does not enable moderation hotkeys for member reports', () => {
    render(
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

    fireEvent.keyDown(window, { key: 'r' })
    fireEvent.keyDown(window, { key: '?' })

    expect(mockResolveModerationReport).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'Moderation Shortcuts' })).not.toBeInTheDocument()
  })
})

function makeReportsResponse(reports: AdminModerationReport[]): AdminModerationReportsResponse {
  return {
    results: reports,
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
