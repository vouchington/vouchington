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
import { makeReport, makeReportsResponse } from '@/test-helpers/admin-reports'

describe('ReportsClient concurrent judgement reruns', () => {
  beforeEach(() => mockNav.reset())
  afterEach(() => vi.clearAllMocks())

  it('tracks two pending reruns until each report receives a new judgement row', async () => {
    const judgement = {
      id: '00000000-0000-7000-8000-000000000001',
      recommended_action: 'remove' as const,
      public_response: 'Same response',
      internal_response: 'Same rationale',
      is_stale: false,
      judged_report_count: 1,
      current_report_count: 1,
    }
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
      ),
    )
  })

  it('serializes reruns for two reports on the same entity until the first judgement completes', async () => {
    const judgement = {
      id: '00000000-0000-7000-8000-000000000001',
      recommended_action: 'remove' as const,
      public_response: 'Same response',
      internal_response: 'Same rationale',
      is_stale: false,
      judged_report_count: 1,
      current_report_count: 1,
    }
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
      ),
    )
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /re-run ai judgement/i })[1]).toBeEnabled(),
    )
    fireEvent.click(screen.getAllByRole('button', { name: /re-run ai judgement/i })[1]!)
    await waitFor(() => expect(mockRerunReportJudgement).toHaveBeenCalledTimes(2))
  })
})
