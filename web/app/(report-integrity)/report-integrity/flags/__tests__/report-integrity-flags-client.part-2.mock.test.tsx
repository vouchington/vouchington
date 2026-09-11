import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
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

  it('renders reporter count and new account percentage', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([
          makeFlag({ reporter_count: 12, new_account_reporter_pct: 0.75 }),
        ])}
        initialStatus='pending'
      />,
    )
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('75.0%')).toBeInTheDocument()
  })

  it('shows pending status badge for unresolved flag', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([makeFlag({ resolved_at: null })])}
        initialStatus='pending'
      />,
    )
    expect(screen.getByText('pending')).toBeInTheDocument()
  })

  it('shows dismissed resolution badge for resolved flag', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([
          makeFlag({
            resolved_at: '2024-01-02T00:00:00Z',
            resolved_by_id: 'a',
            resolution: 'dismissed',
          }),
        ])}
        initialStatus='resolved'
      />,
    )
    expect(screen.getByText('Dismissed')).toBeInTheDocument()
  })

  it('shows penalized resolution badge for resolved flag', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([
          makeFlag({
            resolved_at: '2024-01-02T00:00:00Z',
            resolved_by_id: 'a',
            resolution: 'penalized',
          }),
        ])}
        initialStatus='resolved'
      />,
    )
    expect(screen.getByText('Penalized')).toBeInTheDocument()
  })

  it('shows resolved fallback text when resolution is null', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([
          makeFlag({ resolved_at: '2024-01-02T00:00:00Z', resolved_by_id: null, resolution: null }),
        ])}
        initialStatus='resolved'
      />,
    )
    expect(screen.getByText('resolved')).toBeInTheDocument()
  })

  it('shows resolver id in actions for resolved flags', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([
          makeFlag({
            resolved_at: '2024-01-02T00:00:00Z',
            resolved_by_id: 'admin-abcdefgh-xyz',
            resolution: null,
          }),
        ])}
        initialStatus='resolved'
      />,
    )
    expect(screen.getByText(/by admin-abcdefgh-xyz/)).toBeInTheDocument()
  })

  it('shows the resolved timestamp when no resolver id is available', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([
          makeFlag({ resolved_at: '2024-01-02T00:00:00Z', resolved_by_id: null, resolution: null }),
        ])}
        initialStatus='resolved'
      />,
    )
    expect(screen.getAllByText('Jan 2, 2024').length).toBeGreaterThan(0)
  })

  it('renders table column headers', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData()}
        initialStatus='pending'
      />,
    )
    expect(screen.getByText('Flag Type')).toBeInTheDocument()
    expect(screen.getByText('Target')).toBeInTheDocument()
    expect(screen.getByText('Reporters')).toBeInTheDocument()
    expect(screen.getByText('New Account %')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Actions')).toBeInTheDocument()
  })

  it('renders the localized known flag reason', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([makeFlag({ flag_type: 'mass_report_suspected' })])}
        initialStatus='pending'
      />,
    )
    expect(screen.getByText('Suspected mass report abuse')).toBeInTheDocument()
  })
})
