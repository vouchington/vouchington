import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'

const mockNav = createNavMock()

const {
  mockResolveModerationReport,
  mockRerunReportJudgement,
  mockOnError,
  mockOnSuccess,
  mockUsePendingAiRefresh,
} = vi.hoisted(() => ({
  mockResolveModerationReport: vi.fn<VitestLooseMock>(),
  mockRerunReportJudgement: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
  mockOnSuccess: vi.fn<VitestLooseMock>(),
  mockUsePendingAiRefresh: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/reports'), () => ({
  resolveModerationReport: mockResolveModerationReport,
  rerunReportJudgement: mockRerunReportJudgement,
}))

vi.mock(import('@/lib/on-error'), () => ({ default: mockOnError, onSuccess: mockOnSuccess }))
vi.mock(import('@/hooks/use-pending-ai-refresh'), () => ({
  usePendingAiRefresh: mockUsePendingAiRefresh,
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

import { ReportsClient } from '../reports-client'
import { makeReportsResponse } from '@/test-helpers/admin-reports'

describe('ReportsClient re-run judgement button', () => {
  beforeEach(() => mockNav.reset())
  afterEach(() => vi.clearAllMocks())

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

  it('keeps polling a rerun until the judgement row ID changes, even with identical text', async () => {
    const judgement = {
      id: '00000000-0000-7000-8000-000000000001',
      recommended_action: 'remove' as const,
      public_response: 'Same response',
      internal_response: 'Same rationale',
      is_stale: false,
      judged_report_count: 1,
      current_report_count: 1,
    }
    mockRerunReportJudgement.mockResolvedValueOnce({ queued: true, rerun_by_id: 'admin-1' })
    const { rerender } = render(
      <ReportsClient
        viewerTier='staff'
        data={makeReportsResponse({ judgement })}
      />,
    )
    expect(mockUsePendingAiRefresh).toHaveBeenLastCalledWith(
      false,
      expect.any(Function),
      expect.any(String),
    )
    fireEvent.click(screen.getByRole('button', { name: /re-run ai judgement/i }))
    await waitFor(() =>
      expect(mockUsePendingAiRefresh).toHaveBeenLastCalledWith(
        true,
        expect.any(Function),
        expect.any(String),
      ),
    )
    rerender(
      <ReportsClient
        viewerTier='staff'
        data={makeReportsResponse({
          judgement: { ...judgement, id: '00000000-0000-7000-8000-000000000002' },
        })}
      />,
    )
    expect(mockUsePendingAiRefresh).toHaveBeenLastCalledWith(
      false,
      expect.any(Function),
      expect.any(String),
    )
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
