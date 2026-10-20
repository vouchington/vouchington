import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mockGetReportJudgementRun,
  mockNav,
  mockRerunReportJudgement,
  mockUsePendingAiRefresh,
} from '@/test-helpers/reports-client-rerun-mocks'
import { makeReportsResponse } from '@/test-helpers/admin-reports'
import { ReportsClient } from '../reports-client'

describe('ReportsClient exact rerun polling', () => {
  beforeEach(() => mockNav.reset())
  afterEach(() => vi.clearAllMocks())

  it('ignores unrelated judgement changes and refreshes only when the admitted run completes', async () => {
    const judgement = {
      id: '00000000-0000-7000-8000-000000000001',
      recommended_action: 'remove' as const,
      public_response: 'Same response',
      internal_response: 'Same rationale',
      is_stale: false,
      judged_report_count: 1,
      current_report_count: 1,
    }
    mockRerunReportJudgement.mockResolvedValueOnce({
      queued: true,
      rerun_by_id: 'admin-1',
      run_id: 'report_judgement_test-run',
    })
    const { rerender } = render(
      <ReportsClient
        viewerTier='staff'
        data={makeReportsResponse({ judgement })}
      />,
    )

    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: /re-run ai judgement/i })),
    )
    expect(mockUsePendingAiRefresh.mock.lastCall?.[2]).toBe(
      'rerun:report-1:report_judgement_test-run',
    )
    const refreshCountAfterAdmission = mockNav.refresh.mock.calls.length

    rerender(
      <ReportsClient
        viewerTier='staff'
        data={makeReportsResponse({
          judgement: { ...judgement, id: '00000000-0000-7000-8000-000000000002' },
        })}
      />,
    )
    mockGetReportJudgementRun.mockResolvedValueOnce({ completed: false, judgement_id: null })
    let poll = mockUsePendingAiRefresh.mock.lastCall?.[1] as (() => Promise<void>) | undefined
    await act(async () => poll?.())

    expect(mockGetReportJudgementRun).toHaveBeenCalledWith('report-1', 'report_judgement_test-run')
    expect(mockUsePendingAiRefresh.mock.lastCall?.[2]).toBe(
      'rerun:report-1:report_judgement_test-run',
    )
    expect(mockNav.refresh).toHaveBeenCalledTimes(refreshCountAfterAdmission)

    mockGetReportJudgementRun.mockResolvedValueOnce({
      completed: true,
      judgement_id: '00000000-0000-7000-8000-000000000003',
    })
    poll = mockUsePendingAiRefresh.mock.lastCall?.[1] as (() => Promise<void>) | undefined
    await act(async () => poll?.())

    expect(mockUsePendingAiRefresh.mock.lastCall?.[0]).toBe(false)
    expect(mockNav.refresh).toHaveBeenCalledTimes(refreshCountAfterAdmission + 1)
  })
})
