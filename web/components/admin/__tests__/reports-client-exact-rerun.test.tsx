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
      judged_report_count_capped: false,
      current_report_count: 1,
      current_report_count_capped: false,
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
    mockGetReportJudgementRun.mockResolvedValueOnce({
      run_id: 'report_judgement_test-run',
      status: 'active',
      judgement_id: null,
    })
    let poll = mockUsePendingAiRefresh.mock.lastCall?.[1] as (() => Promise<void>) | undefined
    await act(async () => poll?.())

    expect(mockGetReportJudgementRun).toHaveBeenCalledWith('report-1', 'report_judgement_test-run')
    expect(mockUsePendingAiRefresh.mock.lastCall?.[2]).toBe(
      'rerun:report-1:report_judgement_test-run',
    )
    expect(mockNav.refresh).toHaveBeenCalledTimes(refreshCountAfterAdmission)

    mockGetReportJudgementRun.mockResolvedValueOnce({
      run_id: 'report_judgement_test-run',
      status: 'succeeded',
      judgement_id: '00000000-0000-7000-8000-000000000003',
    })
    poll = mockUsePendingAiRefresh.mock.lastCall?.[1] as (() => Promise<void>) | undefined
    await act(async () => poll?.())

    expect(mockUsePendingAiRefresh.mock.lastCall?.[0]).toBe(false)
    expect(mockNav.refresh).toHaveBeenCalledTimes(refreshCountAfterAdmission + 1)
  })

  it('keeps the exact run locked after active, missing, or mismatched reads at the client deadline', async () => {
    mockRerunReportJudgement.mockResolvedValueOnce({
      queued: true,
      rerun_by_id: 'admin-1',
      run_id: 'run-1',
    })
    render(
      <ReportsClient
        viewerTier='staff'
        data={makeReportsResponse({ automatic_judgement_enabled: false })}
      />,
    )
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: /re-run ai judgement/i })),
    )
    const poll = mockUsePendingAiRefresh.mock.lastCall?.[1] as () => Promise<void>
    const refreshCount = mockNav.refresh.mock.calls.length

    mockGetReportJudgementRun.mockResolvedValueOnce({
      run_id: 'run-1',
      status: 'active',
      judgement_id: null,
    })
    await act(async () => poll())
    mockGetReportJudgementRun.mockRejectedValueOnce(new Error('not found'))
    await act(async () => poll())
    mockGetReportJudgementRun.mockResolvedValueOnce({
      run_id: 'another-run',
      status: 'succeeded',
      judgement_id: 'judgement-2',
    })
    await act(async () => poll())

    const onTimeout = mockUsePendingAiRefresh.mock.lastCall?.[3] as (keys: string[]) => void
    await act(async () => onTimeout(['rerun:report-1:run-1']))

    expect(mockUsePendingAiRefresh.mock.lastCall?.[2]).toBe('rerun:report-1:run-1')
    expect(screen.getByRole('button', { name: /re-run ai judgement/i })).toBeDisabled()
    expect(mockNav.refresh).toHaveBeenCalledTimes(refreshCount)
    expect(screen.getByText(/AI judgement is taking longer than expected/)).toBeVisible()
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: /re-run ai judgement/i })),
    )
    expect(mockRerunReportJudgement).toHaveBeenCalledTimes(1)
  })

  it.each(['failed', 'expired'] as const)(
    'releases a %s run and allows another rerun',
    async status => {
      mockRerunReportJudgement
        .mockResolvedValueOnce({ queued: true, rerun_by_id: 'admin-1', run_id: 'run-1' })
        .mockResolvedValueOnce({ queued: true, rerun_by_id: 'admin-1', run_id: 'run-2' })
      render(
        <ReportsClient
          viewerTier='staff'
          data={makeReportsResponse({ automatic_judgement_enabled: false })}
        />,
      )
      const button = screen.getByRole('button', { name: /re-run ai judgement/i })
      await act(async () => fireEvent.click(button))
      const poll = mockUsePendingAiRefresh.mock.lastCall?.[1] as () => Promise<void>
      mockGetReportJudgementRun.mockResolvedValueOnce({
        run_id: 'run-1',
        status,
        judgement_id: null,
      })
      await act(async () => poll())

      expect(button).toBeEnabled()
      expect(mockUsePendingAiRefresh.mock.lastCall?.[2]).toBe('')
      expect(
        screen.getByText(
          status === 'failed'
            ? /AI judgement could not be completed/
            : /AI judgement is taking longer/,
        ),
      ).toBeVisible()
      await act(async () => fireEvent.click(button))
      expect(mockRerunReportJudgement).toHaveBeenCalledTimes(2)
      expect(mockUsePendingAiRefresh.mock.lastCall?.[2]).toBe('rerun:report-1:run-2')
    },
  )

  it('does not release a new run when an older poll responds later', async () => {
    let resolveOld!: (value: { run_id: string; status: 'succeeded'; judgement_id: string }) => void
    mockRerunReportJudgement
      .mockResolvedValueOnce({ queued: true, rerun_by_id: 'admin-1', run_id: 'run-1' })
      .mockResolvedValueOnce({ queued: true, rerun_by_id: 'admin-1', run_id: 'run-2' })
    render(
      <ReportsClient
        viewerTier='staff'
        data={makeReportsResponse({ automatic_judgement_enabled: false })}
      />,
    )
    const button = screen.getByRole('button', { name: /re-run ai judgement/i })
    await act(async () => fireEvent.click(button))
    mockGetReportJudgementRun.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveOld = resolve
        }),
    )
    const oldPoll = mockUsePendingAiRefresh.mock.lastCall?.[1] as () => Promise<void>
    let pendingOldPoll!: Promise<void>
    act(() => {
      pendingOldPoll = oldPoll()
    })
    mockGetReportJudgementRun.mockResolvedValueOnce({
      run_id: 'run-1',
      status: 'failed',
      judgement_id: null,
    })
    await act(async () => oldPoll())
    expect(button).toBeEnabled()
    await act(async () => fireEvent.click(button))
    const refreshCount = mockNav.refresh.mock.calls.length
    const onTimeout = mockUsePendingAiRefresh.mock.lastCall?.[3] as (keys: string[]) => void
    await act(async () => onTimeout(['rerun:report-1:run-1']))

    await act(async () => {
      resolveOld({ run_id: 'run-1', status: 'succeeded', judgement_id: 'judgement-1' })
      await pendingOldPoll
    })

    expect(mockUsePendingAiRefresh.mock.lastCall?.[2]).toBe('rerun:report-1:run-2')
    expect(button).toBeDisabled()
    expect(mockNav.refresh).toHaveBeenCalledTimes(refreshCount)
    expect(screen.queryByText(/AI judgement is taking longer than expected/)).toBeNull()
  })
})
