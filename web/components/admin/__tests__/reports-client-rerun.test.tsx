import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mockNav,
  mockRerunReportJudgement,
  mockOnError,
  mockOnSuccess,
  mockUsePendingAiRefresh,
} from '@/test-helpers/reports-client-rerun-mocks'

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
