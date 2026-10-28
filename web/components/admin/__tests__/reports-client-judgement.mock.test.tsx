import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from 'vouchington-tooling/next-navigation-mock'

const mockNav = createNavMock()

const {
  mockResolveModerationReport,
  mockRerunReportJudgement,
  mockGetReportJudgementRun,
  mockOnError,
  mockOnSuccess,
} = vi.hoisted(() => ({
  mockResolveModerationReport: vi.fn<VitestLooseMock>(),
  mockRerunReportJudgement: vi.fn<VitestLooseMock>(),
  mockGetReportJudgementRun: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
  mockOnSuccess: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/reports'), () => ({
  resolveModerationReport: mockResolveModerationReport,
  rerunReportJudgement: mockRerunReportJudgement,
  getReportJudgementRun: mockGetReportJudgementRun,
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

import { ReportsClient } from '../reports-client'
import { makeReportsResponse } from '@/test-helpers/admin-reports'

describe('ReportsClient judgement controls', () => {
  beforeEach(() => {
    mockNav.reset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  const testJudgement = {
    id: '00000000-0000-7000-8000-000000000001',
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
})
