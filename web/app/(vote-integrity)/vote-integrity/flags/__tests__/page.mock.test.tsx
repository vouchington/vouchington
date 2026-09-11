import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { mockGetVoteIntegrityFlags } = vi.hoisted(() => ({
  mockGetVoteIntegrityFlags: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getVoteIntegrityFlags: mockGetVoteIntegrityFlags,
}))

vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav data-testid='breadcrumbs' />,
}))

vi.mock(import('../vote-integrity-flags-client'), () => ({
  VoteIntegrityFlagsClient: ({
    initialStatus,
  }: {
    initialStatus: string
    initialData: unknown
  }) => <div data-testid='flags-client'>{initialStatus}</div>,
}))

import VoteIntegrityFlagsPage from '../page'

const emptyData = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
}

describe('VoteIntegrityFlagsPage', () => {
  it('renders the flags client with default pending status', async () => {
    mockGetVoteIntegrityFlags.mockResolvedValueOnce(emptyData)

    render(await VoteIntegrityFlagsPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByTestId('flags-client')).toHaveTextContent('pending')
  })

  it('passes resolved status from searchParams', async () => {
    mockGetVoteIntegrityFlags.mockResolvedValueOnce(emptyData)

    render(await VoteIntegrityFlagsPage({ searchParams: Promise.resolve({ status: 'resolved' }) }))

    expect(screen.getByTestId('flags-client')).toHaveTextContent('resolved')
  })

  it('passes all status from searchParams', async () => {
    mockGetVoteIntegrityFlags.mockResolvedValueOnce(emptyData)

    render(await VoteIntegrityFlagsPage({ searchParams: Promise.resolve({ status: 'all' }) }))

    expect(screen.getByTestId('flags-client')).toHaveTextContent('all')
  })

  it('defaults to pending for unknown status values', async () => {
    mockGetVoteIntegrityFlags.mockResolvedValueOnce(emptyData)

    render(await VoteIntegrityFlagsPage({ searchParams: Promise.resolve({ status: 'unknown' }) }))

    expect(screen.getByTestId('flags-client')).toHaveTextContent('pending')
  })

  it('calls getVoteIntegrityFlags with pending status by default', async () => {
    mockGetVoteIntegrityFlags.mockResolvedValueOnce(emptyData)

    await VoteIntegrityFlagsPage({ searchParams: Promise.resolve({}) })

    expect(mockGetVoteIntegrityFlags).toHaveBeenCalledWith({
      searchParams: { status: 'pending' },
    })
  })

  it('calls getVoteIntegrityFlags without status param for "all"', async () => {
    mockGetVoteIntegrityFlags.mockResolvedValueOnce(emptyData)

    await VoteIntegrityFlagsPage({ searchParams: Promise.resolve({ status: 'all' }) })

    expect(mockGetVoteIntegrityFlags).toHaveBeenCalledWith({
      searchParams: { status: undefined },
    })
  })

  it('renders breadcrumbs', async () => {
    mockGetVoteIntegrityFlags.mockResolvedValueOnce(emptyData)

    render(await VoteIntegrityFlagsPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByTestId('breadcrumbs')).toBeInTheDocument()
  })
})
