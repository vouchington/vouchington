import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPenalties: vi.fn<VitestLooseMock>(),
  metadata: vi.fn<VitestLooseMock>((title: string) => ({ robots: 'noindex', title })),
  breadcrumbs: vi.fn<VitestLooseMock>(() => [
    { name: 'Vote penalties', path: '/vote-integrity/penalties' },
  ]),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getVoteIntegrityPenalties: mocks.getPenalties,
}))
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
  VoteIntegrityPenaltiesClient: ({ initialStatus }: { initialStatus: string }) => (
    <div data-testid='penalties-client'>{initialStatus}</div>
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
})
