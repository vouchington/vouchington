import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { ReportIntegrityFlagsClient } from '../report-integrity-flags-client'

const mockReplace = vi.fn<VitestLooseMock>()
const mockRefresh = vi.fn<VitestLooseMock>()

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({
        replace: mockReplace,
        refresh: mockRefresh,
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
          <button
            type='button'
            onClick={() => onValueChange('all')}
          >
            set all
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

describe('ReportIntegrityFlagsClient — rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the flags heading', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData()}
        initialStatus='pending'
      />,
    )
    expect(screen.getByText('Report Integrity Flags')).toBeInTheDocument()
  })

  it('updates the status selector immediately when changing filters', async () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData()}
        initialStatus='pending'
      />,
    )
    const selector = screen.getByText('Filter: pending').parentElement
    if (!selector) throw new Error('Expected selector container')
    await act(async () => {
      fireEvent.click(within(selector).getByRole('button', { name: 'set resolved' }))
    })
    expect(screen.getByText('Filter: resolved')).toBeInTheDocument()
    expect(mockReplace).toHaveBeenCalledWith('/report-integrity/flags?status=resolved')
  })

  it('appends status=all for all filter', async () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData()}
        initialStatus='resolved'
      />,
    )
    const selector = screen.getByText('Filter: resolved').parentElement
    if (!selector) throw new Error('Expected selector container')
    await act(async () => {
      fireEvent.click(within(selector).getByRole('button', { name: 'set all' }))
    })
    expect(mockReplace).toHaveBeenCalledWith('/report-integrity/flags?status=all')
  })

  it('shows empty state for pending with no flags', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData()}
        initialStatus='pending'
      />,
    )
    expect(screen.getByText(/No pending flags found/)).toBeInTheDocument()
  })

  it('shows empty state without status word for "all" filter', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData()}
        initialStatus='all'
      />,
    )
    expect(screen.getByText(/No flags found/)).toBeInTheDocument()
  })

  it('renders a post_id entity link', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([makeFlag({ post_id: 'post-uuid-1234' })])}
        initialStatus='pending'
      />,
    )
    expect(screen.getByText(/Post\/Comment: post-uui/)).toBeInTheDocument()
  })

  it('renders a reported_user_id entity link', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([makeFlag({ reported_user_id: 'user-uuid-5678' })])}
        initialStatus='pending'
      />,
    )
    expect(screen.getByRole('link', { name: /User: user-uui/ })).toHaveAttribute(
      'href',
      '/user/user-uuid-5678/admin',
    )
  })

  it('renders a hostname_id entity link', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([makeFlag({ hostname_id: 'hostname-abcdefgh' })])}
        initialStatus='pending'
      />,
    )
    expect(screen.getByText(/Hostname: hostname/)).toBeInTheDocument()
  })

  it('renders an rss_feed_item_id entity link', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([makeFlag({ rss_feed_item_id: 'rss-item-xyz123' })])}
        initialStatus='pending'
      />,
    )
    expect(screen.getByText(/RSS Item: rss-item/)).toBeInTheDocument()
  })

  it('renders unknown entity link when no entity id is set', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([makeFlag()])}
        initialStatus='pending'
      />,
    )
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })
})
