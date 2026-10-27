import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPenalties: vi.fn<VitestLooseMock>(),
  getDue: vi.fn<VitestLooseMock>(),
  requireAdmin: vi.fn<VitestLooseMock>(),
  metadata: vi.fn<VitestLooseMock>((title: string) => ({ robots: 'noindex', title })),
  breadcrumbs: vi.fn<VitestLooseMock>(() => [
    { name: 'Vote penalties', path: '/vote-integrity/penalties' },
  ]),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getVoteIntegrityPenalties: mocks.getPenalties,
  getVoteIntegrityPenaltyReviewsDue: mocks.getDue,
}))
vi.mock(import('@/lib/auth/require-admin'), () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock(import('@/lib/i18n/get-translations'), () => ({
  getTranslations: vi.fn<VitestLooseMock>(async () => (key: string) => key),
}))
vi.mock(import('@/lib/navigation/breadcrumbs'), () => ({
  buildBreadcrumbsForPath: mocks.breadcrumbs,
}))
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: mocks.metadata,
}))
vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: ({ items }: { items: unknown[] }) => (
    <div data-testid='breadcrumbs'>{items.length}</div>
  ),
}))
vi.mock(import('./vote-integrity-penalties-client'), () => ({
  VoteIntegrityPenaltiesClient: ({
    initialStatus,
    initialDuePage,
  }: Parameters<
    (typeof import('./vote-integrity-penalties-client'))['VoteIntegrityPenaltiesClient']
  >[0]) => (
    <div data-testid='penalties-client'>
      {initialStatus}:due=
      {initialDuePage?.results.map(row => row.user_username).join(',') ?? 'hidden'}
    </div>
  ),
}))

import VoteIntegrityPenaltiesPage, { dynamic, metadata } from './page'

const emptyPage = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  filter_scope: { source: 'flag', source_flag_id: null },
}

describe('VoteIntegrityPenaltiesPage', () => {
  beforeEach(() => {
    mocks.getPenalties.mockReset()
    mocks.getDue.mockReset()
    mocks.requireAdmin.mockReset()
    mocks.requireAdmin.mockResolvedValue(undefined)
    mocks.getDue.mockResolvedValue({
      results: [{ id: 'due-1', user_username: 'server-review-recipient' }],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })
    mocks.breadcrumbs.mockClear()
    mocks.getPenalties.mockResolvedValue(emptyPage)
  })

  it('declares dynamic no-index metadata and renders the default active ledger', async () => {
    render(await VoteIntegrityPenaltiesPage({ searchParams: Promise.resolve({}) }))

    expect(dynamic).toBe('force-dynamic')
    expect(metadata).toEqual({
      robots: 'noindex',
      title: 'Vote Integrity Penalties | Admin',
    })
    expect(mocks.getPenalties).toHaveBeenCalledWith({
      searchParams: { source: 'flag', status: 'active' },
    })
    expect(screen.getByTestId('penalties-client')).toHaveTextContent('active')
    expect(screen.getByTestId('breadcrumbs')).toHaveTextContent('1')
    expect(mocks.breadcrumbs).toHaveBeenCalledWith(
      '/vote-integrity/penalties',
      expect.objectContaining({ isAuthenticated: true, userRoles: ['administrator'] }),
    )
  })

  it('forwards revoked status', async () => {
    render(
      await VoteIntegrityPenaltiesPage({
        searchParams: Promise.resolve({ status: 'revoked' }),
      }),
    )

    expect(mocks.getPenalties).toHaveBeenCalledWith({
      searchParams: { source: 'flag', status: 'revoked' },
    })
    expect(screen.getByTestId('penalties-client')).toHaveTextContent('revoked')
  })

  it('omits the API status for all and defaults unknown values to active', async () => {
    await VoteIntegrityPenaltiesPage({ searchParams: Promise.resolve({ status: 'all' }) })
    expect(mocks.getPenalties).toHaveBeenLastCalledWith({
      searchParams: { source: 'flag', status: undefined },
    })

    render(
      await VoteIntegrityPenaltiesPage({
        searchParams: Promise.resolve({ status: 'unexpected' }),
      }),
    )
    expect(screen.getByTestId('penalties-client')).toHaveTextContent('active')
  })
  it('server-renders the first due page and does not fetch hidden non-active queues', async () => {
    render(await VoteIntegrityPenaltiesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByTestId('penalties-client')).toHaveTextContent('due=server-review-recipient')
    expect(mocks.getDue).toHaveBeenCalledOnce()
    mocks.getDue.mockClear()
    await VoteIntegrityPenaltiesPage({ searchParams: Promise.resolve({ status: 'revoked' }) })
    await VoteIntegrityPenaltiesPage({ searchParams: Promise.resolve({ status: 'all' }) })
    expect(mocks.getDue).not.toHaveBeenCalled()
  })

  it('authorizes before starting either private read and propagates due-read failures', async () => {
    const denied = new Error('not an administrator')
    mocks.requireAdmin.mockRejectedValueOnce(denied)
    await expect(VoteIntegrityPenaltiesPage({ searchParams: Promise.resolve({}) })).rejects.toBe(
      denied,
    )
    expect(mocks.getPenalties).not.toHaveBeenCalled()
    expect(mocks.getDue).not.toHaveBeenCalled()
    const failure = new Error('due read failed')
    mocks.getDue.mockRejectedValueOnce(failure)
    await expect(VoteIntegrityPenaltiesPage({ searchParams: Promise.resolve({}) })).rejects.toBe(
      failure,
    )
  })
})
