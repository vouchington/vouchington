import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ReportIntegrityFlagsClient } from '../report-integrity-flags-client'

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({
        replace: vi.fn<VitestLooseMock>(),
        refresh: vi.fn<VitestLooseMock>(),
      }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        value,
        onValueChange,
        children,
      }: {
        value: string
        onValueChange: (value: string) => void
        children: ReactNode
      }) => (
        <div>
          <div>{`Filter: ${value}`}</div>
          <button
            type='button'
            onClick={() => onValueChange('resolved')}
          >
            set resolved
          </button>
          {children}
        </div>
      ),
      SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
        <div data-value={value}>{children}</div>
      ),
      SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

vi.mock(import('@/lib/api/client/report-integrity'), () => ({
  resolveReportIntegrityFlag: vi.fn<VitestLooseMock>(),
  applyReportAbusePenalty: vi.fn<VitestLooseMock>(),
}))

const makeFlag = (
  overrides: Partial<
    Parameters<typeof ReportIntegrityFlagsClient>[0]['initialData']['results'][0]
  > = {},
) => ({
  id: 'flag-1',
  post_id: null,
  reported_user_id: null,
  hostname_id: null,
  rss_feed_item_id: null,
  flag_type: 'mass_report_suspected' as const,
  reporter_count: 5,
  new_account_reporter_pct: 0.4,
  details: {},
  resolved_at: null,
  resolved_by_id: null,
  resolution: null,
  created_at: '2024-01-01T00:00:00Z',
  ...overrides,
})

const makeInitialData = (
  flags: Parameters<typeof ReportIntegrityFlagsClient>[0]['initialData']['results'] = [],
) => ({
  results: flags,
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
})

describe('ReportIntegrityFlagsClient — actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows Resolve and Penalize reporters buttons for a pending flag', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([makeFlag()])}
        initialStatus='pending'
      />,
    )
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Penalize reporters' })).toBeInTheDocument()
  })

  it('shows confirm prompt on first Penalize reporters click', async () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([makeFlag()])}
        initialStatus='pending'
      />,
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Penalize reporters' }))
    })
    expect(screen.getByRole('button', { name: 'Confirm?' })).toBeInTheDocument()
  })

  it('calls applyReportAbusePenalty on second Penalize reporters click', async () => {
    const { applyReportAbusePenalty } = await import('@/lib/api/client/report-integrity')
    const mockApplyPenalty = vi.mocked(applyReportAbusePenalty)
    const penalizedFlag = makeFlag({
      resolved_at: '2024-01-02T00:00:00Z',
      resolution: 'penalized',
    })
    mockApplyPenalty.mockResolvedValueOnce({ flag: penalizedFlag, penalized_user_count: 2 })

    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([makeFlag()])}
        initialStatus='pending'
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Penalize reporters' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm?' }))
    })

    await waitFor(() => {
      expect(mockApplyPenalty).toHaveBeenCalledWith('flag-1')
    })
  })

  it('replaces the row from the confirmed penalty response', async () => {
    const { applyReportAbusePenalty } = await import('@/lib/api/client/report-integrity')
    vi.mocked(applyReportAbusePenalty).mockResolvedValueOnce({
      flag: makeFlag({
        resolved_at: '2024-01-02T00:00:00Z',
        resolved_by_id: 'admin-1',
        resolution: 'penalized',
      }),
      penalized_user_count: 3,
    })

    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([makeFlag()])}
        initialStatus='pending'
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Penalize reporters' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm?' }))
    })

    await waitFor(() => expect(screen.queryByText('Suspected mass report abuse')).toBeNull())
  })

  it('shows error message when applying the reporter penalty fails', async () => {
    const { applyReportAbusePenalty } = await import('@/lib/api/client/report-integrity')
    vi.mocked(applyReportAbusePenalty).mockRejectedValueOnce(new Error('Server error'))

    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([makeFlag()])}
        initialStatus='pending'
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Penalize reporters' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm?' }))
    })

    await waitFor(() => {
      expect(
        screen.getByText('The result is uncertain. Reload before trying again.'),
      ).toBeInTheDocument()
    })
  })

  it('Resolve button is disabled until a resolution is selected', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([makeFlag({ id: 'flag-1' })])}
        initialStatus='pending'
      />,
    )
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeDisabled()
  })

  it('calls resolveReportIntegrityFlag when Resolve is clicked with a resolution selected', async () => {
    const { resolveReportIntegrityFlag } = await import('@/lib/api/client/report-integrity')
    const mockResolve = vi.mocked(resolveReportIntegrityFlag)
    const resolvedFlag = makeFlag({
      id: 'flag-1',
      resolved_at: '2024-01-02T00:00:00Z',
      resolved_by_id: 'admin-1',
      resolution: 'dismissed',
    })
    mockResolve.mockResolvedValueOnce({ flag: resolvedFlag })

    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([makeFlag({ id: 'flag-1' })])}
        initialStatus='pending'
      />,
    )

    // Header has Select index 0, row resolution has Select index 1.
    // Clicking "set resolved" on the row Select sets resolution='resolved'.
    const setResolvedButtons = screen.getAllByRole('button', { name: 'set resolved' })
    await act(async () => {
      fireEvent.click(setResolvedButtons[1]!)
    })

    const resolveBtn = screen.getByRole('button', { name: 'Resolve' })
    expect(resolveBtn).not.toBeDisabled()

    await act(async () => {
      fireEvent.click(resolveBtn)
    })

    await waitFor(() => {
      expect(mockResolve).toHaveBeenCalledWith('flag-1', 'resolved')
    })
  })

  it('shows actionError when resolve fails', async () => {
    const { resolveReportIntegrityFlag } = await import('@/lib/api/client/report-integrity')
    vi.mocked(resolveReportIntegrityFlag).mockRejectedValueOnce(new Error('Resolve error'))

    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([makeFlag({ id: 'flag-1' })])}
        initialStatus='pending'
      />,
    )

    const setResolvedButtons = screen.getAllByRole('button', { name: 'set resolved' })
    await act(async () => {
      fireEvent.click(setResolvedButtons[1]!)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))
    })

    await waitFor(() => {
      expect(
        screen.getByText('The result is uncertain. Reload before trying again.'),
      ).toBeInTheDocument()
    })
  })
})
