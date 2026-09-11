import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { mockGetReportIntegrityFlags } = vi.hoisted(() => ({
  mockGetReportIntegrityFlags: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getReportIntegrityFlags: mockGetReportIntegrityFlags,
}))

vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav data-testid='breadcrumbs' />,
}))

vi.mock(import('../report-integrity-flags-client'), () => ({
  ReportIntegrityFlagsClient: ({
    initialStatus,
  }: {
    initialStatus: string
    initialData: unknown
  }) => <div data-testid='flags-client'>{initialStatus}</div>,
}))

import ReportIntegrityFlagsPage from '../page'

const emptyData = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
}

describe('ReportIntegrityFlagsPage', () => {
  it('renders the flags client with default pending status', async () => {
    mockGetReportIntegrityFlags.mockResolvedValueOnce(emptyData)

    render(await ReportIntegrityFlagsPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByTestId('flags-client')).toHaveTextContent('pending')
  })

  it('passes resolved status from searchParams', async () => {
    mockGetReportIntegrityFlags.mockResolvedValueOnce(emptyData)

    render(
      await ReportIntegrityFlagsPage({ searchParams: Promise.resolve({ status: 'resolved' }) }),
    )

    expect(screen.getByTestId('flags-client')).toHaveTextContent('resolved')
  })

  it('passes all status from searchParams', async () => {
    mockGetReportIntegrityFlags.mockResolvedValueOnce(emptyData)

    render(await ReportIntegrityFlagsPage({ searchParams: Promise.resolve({ status: 'all' }) }))

    expect(screen.getByTestId('flags-client')).toHaveTextContent('all')
  })

  it('defaults to pending for unknown status values', async () => {
    mockGetReportIntegrityFlags.mockResolvedValueOnce(emptyData)

    render(await ReportIntegrityFlagsPage({ searchParams: Promise.resolve({ status: 'unknown' }) }))

    expect(screen.getByTestId('flags-client')).toHaveTextContent('pending')
  })

  it('defaults to pending for missing status param', async () => {
    mockGetReportIntegrityFlags.mockResolvedValueOnce(emptyData)

    render(await ReportIntegrityFlagsPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByTestId('flags-client')).toHaveTextContent('pending')
  })

  it('calls getReportIntegrityFlags with pending status (no status param)', async () => {
    mockGetReportIntegrityFlags.mockResolvedValueOnce(emptyData)

    await ReportIntegrityFlagsPage({ searchParams: Promise.resolve({}) })

    expect(mockGetReportIntegrityFlags).toHaveBeenCalledWith({
      searchParams: { status: 'pending' },
    })
  })

  it('calls getReportIntegrityFlags without status param for "all"', async () => {
    mockGetReportIntegrityFlags.mockResolvedValueOnce(emptyData)

    await ReportIntegrityFlagsPage({ searchParams: Promise.resolve({ status: 'all' }) })

    expect(mockGetReportIntegrityFlags).toHaveBeenCalledWith({
      searchParams: { status: undefined },
    })
  })

  it('renders breadcrumbs', async () => {
    mockGetReportIntegrityFlags.mockResolvedValueOnce(emptyData)

    render(await ReportIntegrityFlagsPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByTestId('breadcrumbs')).toBeInTheDocument()
  })
})
