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
      Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectContent: ({ children }: { children: ReactNode }) => children,
      SelectItem: ({ children }: { children: ReactNode; value: string }) => <div>{children}</div>,
      SelectTrigger: ({ children }: { children: ReactNode }) => children,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

import {
  ReportsClient,
  type AdminModerationReport,
  type AdminModerationReportsResponse,
} from '../reports-client'

describe('ReportsClient judgement controls', () => {
  beforeEach(() => {
    mockNav.reset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

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

    expect(screen.getByText('remove')).toBeVisible()
  })

  it('renders an outdated badge when the judgement is stale', () => {
    render(
      <ReportsClient
        viewerTier='staff'
        data={makeReportsResponse({ judgement: { ...testJudgement, is_stale: true } })}
      />,
    )

    expect(screen.getByText('Outdated')).toBeVisible()
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

  it('does not render the verdict chip for member-tier rows', () => {
    const { container } = render(
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

    expect(container.querySelector('[data-pw="report-judgement-chip"]')).toBeNull()
  })

  it('shows the Re-run judgement button on all staff rows including non-pending', () => {
    render(
      <ReportsClient
        viewerTier='staff'
        data={makeReportsResponse({ status: 'reviewed' })}
      />,
    )

    expect(screen.getByRole('button', { name: /re-run ai judgement/i })).toBeVisible()
  })

  it('calls rerunReportJudgement and shows a success toast on success', async () => {
    mockRerunReportJudgement.mockResolvedValueOnce({ queued: true, rerun_by_id: 'admin-1' })
    render(
      <ReportsClient
        viewerTier='staff'
        data={makeReportsResponse()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /re-run ai judgement/i }))

    await waitFor(() => expect(mockRerunReportJudgement).toHaveBeenCalledWith('report-1'))
    await waitFor(() => expect(mockOnSuccess).toHaveBeenCalledWith('Judgement re-run queued'))
    await waitFor(() => expect(mockNav.refresh).toHaveBeenCalled())
  })

  it('routes a failed re-run through onError and keeps the row', async () => {
    const failure = new Error('Queue unavailable')
    mockRerunReportJudgement.mockRejectedValueOnce(failure)
    render(
      <ReportsClient
        viewerTier='staff'
        data={makeReportsResponse()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /re-run ai judgement/i }))

    await waitFor(() =>
      expect(mockOnError).toHaveBeenCalledWith(
        failure,
        expect.objectContaining({ fallback: 'Failed to re-run judgement' }),
      ),
    )
    expect(screen.getByText('Reported post')).toBeVisible()
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
