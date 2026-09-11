import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/error'

const mocks = vi.hoisted(() => ({
  getPenalties: vi.fn<VitestLooseMock>(),
  metadata: vi.fn<VitestLooseMock>((title: string) => ({ robots: 'noindex', title })),
  breadcrumbs: vi.fn<VitestLooseMock>(() => [
    { name: 'Report penalties', path: '/report-integrity/penalties' },
  ]),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getReportIntegrityPenalties: mocks.getPenalties,
}))
vi.mock(import('@/lib/i18n/get-translations'), () => ({
  getTranslations: vi.fn<VitestLooseMock>(async () => (key: string) => `translated:${key}`),
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
vi.mock(import('./report-integrity-penalties-client'), () => {
  const ReportIntegrityPenaltiesClient: ReportIntegrityPenaltiesClientComponent = ({
    available,
    initialData,
    initialStatus,
  }) => (
    <div data-testid='penalties-client'>
      {String(available)}:{initialStatus}:{initialData.results.map(item => item.id).join(',')}
    </div>
  )
  return { ReportIntegrityPenaltiesClient }
})

import ReportIntegrityPenaltiesPage, { dynamic, metadata } from './page'

const penaltyPage = {
  results: [{ id: 'penalty-1' }],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
}

type ReportIntegrityPenaltiesClientComponent =
  (typeof import('./report-integrity-penalties-client'))['ReportIntegrityPenaltiesClient']

describe('ReportIntegrityPenaltiesPage', () => {
  beforeEach(() => {
    mocks.getPenalties.mockReset()
    mocks.breadcrumbs.mockClear()
    mocks.getPenalties.mockResolvedValue(penaltyPage)
  })

  it('declares dynamic no-index metadata and renders the active ledger with breadcrumbs', async () => {
    render(await ReportIntegrityPenaltiesPage({ searchParams: Promise.resolve({}) }))

    expect(dynamic).toBe('force-dynamic')
    expect(metadata).toEqual({
      robots: 'noindex',
      title: 'Report Integrity Penalties | Admin',
    })
    expect(mocks.getPenalties).toHaveBeenCalledWith({ searchParams: { status: 'active' } })
    expect(screen.getByTestId('penalties-client')).toHaveTextContent('true:active:penalty-1')
    expect(screen.getByTestId('breadcrumbs')).toHaveTextContent('1')
    expect(mocks.breadcrumbs).toHaveBeenCalledWith('/report-integrity/penalties', {
      isAuthenticated: true,
      userRoles: ['administrator'],
      tail: [
        {
          name: 'translated:extracted.flags.integrityPenalties.reportTitle_6f7f2d01',
          path: '/report-integrity/penalties',
        },
      ],
    })
  })

  it('forwards revoked status and omits the API status for all', async () => {
    render(
      await ReportIntegrityPenaltiesPage({
        searchParams: Promise.resolve({ status: 'revoked' }),
      }),
    )
    expect(mocks.getPenalties).toHaveBeenLastCalledWith({
      searchParams: { status: 'revoked' },
    })
    expect(screen.getByTestId('penalties-client')).toHaveTextContent('true:revoked:penalty-1')

    await ReportIntegrityPenaltiesPage({ searchParams: Promise.resolve({ status: 'all' }) })
    expect(mocks.getPenalties).toHaveBeenLastCalledWith({
      searchParams: { status: undefined },
    })
  })

  it('defaults unknown status values to active', async () => {
    render(
      await ReportIntegrityPenaltiesPage({
        searchParams: Promise.resolve({ status: 'unexpected' }),
      }),
    )

    expect(mocks.getPenalties).toHaveBeenCalledWith({ searchParams: { status: 'active' } })
    expect(screen.getByTestId('penalties-client')).toHaveTextContent('true:active:penalty-1')
  })

  it('renders an unavailable empty ledger when an older backend returns 404', async () => {
    mocks.getPenalties.mockRejectedValueOnce(new ApiError('missing', 404))

    render(await ReportIntegrityPenaltiesPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByTestId('penalties-client')).toHaveTextContent('false:active:')
  })

  it.each([new ApiError('server', 500), new Error('network')])(
    'does not hide unexpected collection failure %#',
    async error => {
      mocks.getPenalties.mockRejectedValueOnce(error)

      await expect(
        // `Promise.resolve({})` here is mock prop data, not a callback/promise control-flow
        // choice: ReportIntegrityPenaltiesPage's `searchParams` prop is typed `Promise<...>`
        // (Next.js's async searchParams convention), so the resolved promise is the shape the
        // component itself expects, not something this (already-async) test callback should
        // await separately.
        // oxlint-disable-next-line promise/no-promise-in-callback
        ReportIntegrityPenaltiesPage({ searchParams: Promise.resolve({}) }),
      ).rejects.toBe(error)
    },
  )
})
