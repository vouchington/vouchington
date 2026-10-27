import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@vouchington/api-client'

const mocks = vi.hoisted(() => ({
  getPenalties: vi.fn<VitestLooseMock>(),
  getDue: vi.fn<VitestLooseMock>(),
  requireAdmin: vi.fn<VitestLooseMock>(),
  metadata: vi.fn<VitestLooseMock>((title: string) => ({ robots: 'noindex', title })),
  breadcrumbs: vi.fn<VitestLooseMock>(() => [
    { name: 'Report penalties', path: '/report-integrity/penalties' },
  ]),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getReportIntegrityPenalties: mocks.getPenalties,
  getReportIntegrityPenaltyReviewsDue: mocks.getDue,
}))
vi.mock(import('@/lib/auth/require-admin'), () => ({ requireAdmin: mocks.requireAdmin }))
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
    initialData,
    initialStatus,
    initialDuePage,
  }) => (
    <div data-testid='penalties-client'>
      {initialStatus}:{initialData.results.map(item => item.id).join(',')}:due=
      {initialDuePage?.results.map(item => item.user_username).join(',') ?? 'hidden'}
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
    mocks.getDue.mockReset()
    mocks.requireAdmin.mockReset()
    mocks.requireAdmin.mockResolvedValue(undefined)
    mocks.getDue.mockResolvedValue({
      results: [{ id: 'due-1', user_username: 'server-review-recipient' }],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })
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
    expect(screen.getByTestId('penalties-client')).toHaveTextContent('active:penalty-1')
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
    expect(screen.getByTestId('penalties-client')).toHaveTextContent('revoked:penalty-1')

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
    expect(screen.getByTestId('penalties-client')).toHaveTextContent('active:penalty-1')
  })

  it.each([new ApiError('missing', 404), new ApiError('server', 500), new Error('network')])(
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
  it('server-renders the first due page and does not fetch hidden non-active queues', async () => {
    render(await ReportIntegrityPenaltiesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByTestId('penalties-client')).toHaveTextContent('due=server-review-recipient')
    expect(mocks.getDue).toHaveBeenCalledOnce()
    mocks.getDue.mockClear()
    await ReportIntegrityPenaltiesPage({ searchParams: Promise.resolve({ status: 'revoked' }) })
    await ReportIntegrityPenaltiesPage({ searchParams: Promise.resolve({ status: 'all' }) })
    expect(mocks.getDue).not.toHaveBeenCalled()
  })

  it('authorizes before starting either private read and propagates due-read failures', async () => {
    const denied = new Error('not an administrator')
    mocks.requireAdmin.mockRejectedValueOnce(denied)
    await expect(ReportIntegrityPenaltiesPage({ searchParams: Promise.resolve({}) })).rejects.toBe(
      denied,
    )
    expect(mocks.getPenalties).not.toHaveBeenCalled()
    expect(mocks.getDue).not.toHaveBeenCalled()
    const failure = new Error('due read failed')
    mocks.getDue.mockRejectedValueOnce(failure)
    await expect(ReportIntegrityPenaltiesPage({ searchParams: Promise.resolve({}) })).rejects.toBe(
      failure,
    )
  })
})
