import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: (props: {
        children: ReactNode
        onValueChange: (value: string) => void
        value: string
      }) => (
        <select
          aria-label='Sort reports'
          value={props.value}
          onChange={event => props.onValueChange(event.currentTarget.value)}
        >
          {props.children}
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

import {
  ReportsClient,
  type AdminModerationReport,
  type AdminModerationReportsResponse,
} from './reports-client'

describe('ReportsClient', () => {
  beforeEach(() => {
    mockNav.reset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('removes a report after it is marked reviewed', async () => {
    mockResolveModerationReport.mockResolvedValueOnce(undefined)
    render(
      <ReportsClient
        viewerTier='staff'
        data={makeReportsResponse()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /mark reported post report reviewed/i }))

    await waitFor(() => expect(screen.queryByText('Reported post')).not.toBeInTheDocument())
    expect(mockResolveModerationReport).toHaveBeenCalledWith('report-1', 'reviewed')
  })

  it('renders SLA and report-count badges', () => {
    const { container } = render(
      <ReportsClient
        viewerTier='staff'
        data={makeReportsResponse({ report_count: 3 })}
      />,
    )

    expect(container.querySelector('[data-pw="moderation-sla-badge"]')).not.toBeNull()
    expect(screen.getByText('3 reports')).toBeVisible()
  })

  it.each(['after', 'before'] as const)(
    'updates the URL sort and clears the %s cursor',
    cursorDirection => {
      window.history.pushState({}, '', `/reports?status=pending&${cursorDirection}=abc`)
      render(
        <ReportsClient
          viewerTier='staff'
          data={makeReportsResponse()}
          sortOrder='severity'
        />,
      )

      fireEvent.change(screen.getByLabelText('Sort reports'), {
        target: { value: 'most_reported' },
      })

      expect(mockNav.push).toHaveBeenCalledWith('/reports?status=pending&sort=most_reported', {
        scroll: false,
      })
    },
  )

  it('routes a failed dismissal through onError', async () => {
    const failure = new Error('Nope')
    mockResolveModerationReport.mockRejectedValueOnce(failure)
    render(
      <ReportsClient
        viewerTier='staff'
        data={makeReportsResponse()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /dismiss reported post report/i }))

    await waitFor(() =>
      expect(mockOnError).toHaveBeenCalledWith(
        failure,
        expect.objectContaining({ fallback: 'Failed to update report' }),
      ),
    )
    // The row remains (not resolved) since the mutation failed.
    expect(screen.getByText('Reported post')).toBeVisible()
  })

  describe('AdminReportRow resolve buttons', () => {
    it('shows Reviewed and Dismiss buttons for a pending report', () => {
      render(
        <ReportsClient
          viewerTier='staff'
          data={makeReportsResponse({ status: 'pending' })}
        />,
      )

      expect(
        screen.getByRole('button', { name: /mark reported post report reviewed/i }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /dismiss reported post report/i }),
      ).toBeInTheDocument()
    })

    it.each(['reviewed', 'dismissed'] as const)(
      'does NOT show Reviewed/Dismiss buttons for a %s report',
      status => {
        render(
          <ReportsClient
            viewerTier='staff'
            data={makeReportsResponse({ status })}
          />,
        )

        expect(
          screen.queryByRole('button', { name: /mark reported post report reviewed/i }),
        ).not.toBeInTheDocument()
        expect(
          screen.queryByRole('button', { name: /dismiss reported post report/i }),
        ).not.toBeInTheDocument()
        expect(screen.getByText('Reported post')).toBeInTheDocument()
      },
    )
  })

  describe('judgement verdict chip', () => {
    const testJudgement = {
      recommended_action: 'remove' as const,
      public_response: 'This content was removed for violating our spam policy.',
      internal_response: 'Clear spam pattern detected across multiple communities.',
      is_stale: false,
      judged_report_count: 1,
      current_report_count: 1,
    }

    it('renders a verdict chip when the report has a judgement', () => {
      render(
        <ReportsClient
          viewerTier='staff'
          data={makeReportsResponse({ judgement: testJudgement })}
        />,
      )

      expect(screen.getByText('remove')).toBeInTheDocument()
    })

    it('renders an em-dash placeholder when judgement is null', () => {
      render(
        <ReportsClient
          viewerTier='staff'
          data={makeReportsResponse({ judgement: null })}
        />,
      )

      expect(screen.queryByText('remove')).not.toBeInTheDocument()
    })
  })
})

function makeReportsResponse(
  overrides: {
    status?: 'pending' | 'reviewed' | 'actioned' | 'dismissed'
    judgement?: AdminModerationReport['judgement']
  } & Partial<AdminModerationReport> = {},
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
