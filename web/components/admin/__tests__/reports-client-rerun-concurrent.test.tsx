import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mockNav,
  mockRerunReportJudgement,
  mockOnSuccess,
  mockUsePendingAiRefresh,
} from '@/test-helpers/reports-client-rerun-mocks'

import { ReportsClient } from '../reports-client'
import { makeReport, makeReportsResponse } from '@/test-helpers/admin-reports'

function makeJudgement() {
  return {
    id: '00000000-0000-7000-8000-000000000001',
    recommended_action: 'remove' as const,
    public_response: 'Same response',
    internal_response: 'Same rationale',
    is_stale: false,
    judged_report_count: 1,
    current_report_count: 1,
  }
}

describe('ReportsClient concurrent judgement reruns', () => {
  beforeEach(() => mockNav.reset())
  afterEach(() => vi.clearAllMocks())

  it('tracks two pending reruns until each report receives a new judgement row', async () => {
    const judgement = makeJudgement()
    const first = makeReport({ id: 'report-1', judgement })
    const second = makeReport({ id: 'report-2', entity_id: 'post-2', judgement })
    const data = makeReportsResponse()
    mockRerunReportJudgement.mockResolvedValue({ queued: true, rerun_by_id: 'admin-1' })
    const { rerender } = render(
      <ReportsClient
        viewerTier='staff'
        data={{ ...data, results: [first, second] }}
      />,
    )
    const rerunButtons = screen.getAllByRole('button', { name: /re-run ai judgement/i })
    fireEvent.click(rerunButtons[0]!)
    await waitFor(() => expect(mockOnSuccess).toHaveBeenCalledTimes(1))
    const firstPendingKey = mockUsePendingAiRefresh.mock.lastCall?.[2]
    await waitFor(() => expect(rerunButtons[1]).toBeEnabled())
    fireEvent.click(rerunButtons[1]!)
    await waitFor(() => expect(mockOnSuccess).toHaveBeenCalledTimes(2))
    expect(mockUsePendingAiRefresh.mock.lastCall?.[2]).not.toBe(firstPendingKey)
    rerender(
      <ReportsClient
        viewerTier='staff'
        data={{
          ...data,
          results: [
            { ...first, judgement: { ...judgement, id: '00000000-0000-7000-8000-000000000002' } },
            second,
          ],
        }}
      />,
    )
    expect(mockUsePendingAiRefresh).toHaveBeenLastCalledWith(
      true,
      expect.any(Function),
      expect.any(String),
      expect.any(Function),
    )
    rerender(
      <ReportsClient
        viewerTier='staff'
        data={{
          ...data,
          results: [
            { ...first, judgement: { ...judgement, id: '00000000-0000-7000-8000-000000000002' } },
            { ...second, judgement: { ...judgement, id: '00000000-0000-7000-8000-000000000003' } },
          ],
        }}
      />,
    )
    await waitFor(() =>
      expect(mockUsePendingAiRefresh).toHaveBeenLastCalledWith(
        false,
        expect.any(Function),
        expect.any(String),
        expect.any(Function),
      ),
    )
  })

  it('serializes reruns for two reports on the same entity until the first judgement completes', async () => {
    const judgement = makeJudgement()
    const first = makeReport({ id: 'report-1', judgement })
    const second = makeReport({ id: 'report-2', judgement })
    const data = makeReportsResponse()
    mockRerunReportJudgement.mockResolvedValue({ queued: true, rerun_by_id: 'admin-1' })
    const { rerender } = render(
      <ReportsClient
        viewerTier='staff'
        data={{ ...data, results: [first, second] }}
      />,
    )
    fireEvent.click(screen.getAllByRole('button', { name: /re-run ai judgement/i })[0]!)
    await waitFor(() =>
      expect(mockUsePendingAiRefresh).toHaveBeenLastCalledWith(
        true,
        expect.any(Function),
        expect.any(String),
        expect.any(Function),
      ),
    )
    await waitFor(() => expect(mockNav.refresh).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /re-run ai judgement/i })[1]).toBeDisabled(),
    )
    expect(mockRerunReportJudgement).toHaveBeenCalledTimes(1)

    rerender(
      <ReportsClient
        viewerTier='staff'
        data={{
          ...data,
          results: [
            { ...first, judgement: { ...judgement, id: '00000000-0000-7000-8000-000000000002' } },
            { ...second, judgement: { ...judgement, id: '00000000-0000-7000-8000-000000000002' } },
          ],
        }}
      />,
    )
    await waitFor(() =>
      expect(mockUsePendingAiRefresh).toHaveBeenLastCalledWith(
        false,
        expect.any(Function),
        expect.any(String),
        expect.any(Function),
      ),
    )
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /re-run ai judgement/i })[1]).toBeEnabled(),
    )
    fireEvent.click(screen.getAllByRole('button', { name: /re-run ai judgement/i })[1]!)
    await waitFor(() => expect(mockRerunReportJudgement).toHaveBeenCalledTimes(2))
  })

  it('releases only an expired rerun while another report is still pending', async () => {
    const judgement = makeJudgement()
    const first = makeReport({ id: 'report-1', judgement })
    const second = makeReport({ id: 'report-2', entity_id: 'post-2', judgement })
    const data = makeReportsResponse()
    mockRerunReportJudgement.mockResolvedValue({ queued: true, rerun_by_id: 'admin-1' })
    render(
      <ReportsClient
        viewerTier='staff'
        data={{ ...data, results: [first, second] }}
      />,
    )
    const buttons = screen.getAllByRole('button', { name: /re-run ai judgement/i })
    fireEvent.click(buttons[0]!)
    await waitFor(() => expect(buttons[1]).toBeEnabled())
    fireEvent.click(buttons[1]!)
    await waitFor(() => expect(buttons[0]).toBeDisabled())
    const onTimeout = mockUsePendingAiRefresh.mock.lastCall?.[3] as
      | ((keys: string[]) => void)
      | undefined

    await act(async () => onTimeout?.([`rerun:report-1:${judgement.id}`]))

    await waitFor(() => expect(buttons[0]).toBeEnabled())
    expect(buttons[1]).toBeDisabled()
    expect(screen.getByText(/AI judgement is taking longer than expected/)).toBeVisible()
  })
})
