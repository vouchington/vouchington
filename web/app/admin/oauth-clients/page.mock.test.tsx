import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { ListResponse } from '@/types/api-responses'
import type { AdminOAuthClientListItem } from '@/types/oauth-apps'
import listFixture from '../../../../api-fixtures/v1/responses/web.admin.oauth-clients.list.json'
import AdminOAuthClientsPage from './page'

const requireAdminMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const getAdminOAuthClientsMock = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(import('@/lib/auth/require-admin'), () => ({
  requireAdmin: requireAdminMock,
}))

vi.mock(
  import('@/lib/api/server'),
  () =>
    ({
      getAdminOAuthClients: getAdminOAuthClientsMock,
    }) as unknown as typeof import('@/lib/api/server'),
)

vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>().mockReturnValue({}),
}))

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav data-testid='breadcrumbs' />,
}))

vi.mock(import('@/components/admin/admin-page-header'), () => ({
  AdminPageHeader: ({ title, children }: { title: string; children?: ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {children}
    </header>
  ),
}))

vi.mock(import('@/components/admin/admin-table-shell'), () => ({
  AdminTableShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock(import('@/components/admin/admin-pagination'), () => ({
  AdminPagination: ({
    previousHref,
    nextHref,
  }: {
    previousHref?: string | null
    nextHref?: string | null
  }) => (
    <nav
      data-testid='admin-pagination'
      data-previous={previousHref ?? ''}
      data-next={nextHref ?? ''}
    />
  ),
}))

vi.mock(import('@/components/admin/oauth-clients/oauth-client-verification-row'), () => ({
  OAuthClientVerificationRow: ({ client }: { client: AdminOAuthClientListItem }) => (
    <tr>
      <td>{client.client_name}</td>
    </tr>
  ),
}))

const fixturePage = listFixture as ListResponse<AdminOAuthClientListItem>
const emptyPage: ListResponse<AdminOAuthClientListItem> = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
}

async function renderPage(searchParams: { after?: string; verification?: string } = {}) {
  render(await AdminOAuthClientsPage({ searchParams: Promise.resolve(searchParams) }))
}

function pagination() {
  return screen.getByTestId('admin-pagination')
}

describe('AdminOAuthClientsPage', () => {
  beforeEach(() => {
    requireAdminMock.mockReset()
    requireAdminMock.mockResolvedValue(undefined)
    getAdminOAuthClientsMock.mockReset()
    getAdminOAuthClientsMock.mockResolvedValue(fixturePage)
  })

  it('lists unverified apps by default for administrators', async () => {
    await renderPage()

    expect(requireAdminMock).toHaveBeenCalled()
    expect(getAdminOAuthClientsMock).toHaveBeenCalledWith({
      verification: 'unverified',
      after: undefined,
      limit: 25,
    })
    expect(screen.getByRole('heading', { name: 'OAuth Apps' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Fixture Agent' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Unverified' })).toHaveAttribute('aria-current', 'page')
    expect(pagination()).toHaveAttribute('data-previous', '')
    expect(pagination()).toHaveAttribute('data-next', '')
  })

  it.each(['verified', 'all'] as const)('applies the %s filter', async verification => {
    await renderPage({ verification })

    expect(getAdminOAuthClientsMock).toHaveBeenCalledWith(expect.objectContaining({ verification }))
    const current = screen
      .getAllByRole('link')
      .filter(link => link.getAttribute('aria-current') === 'page')
    expect(current.map(link => link.getAttribute('href'))).toEqual([
      `/admin/oauth-clients?verification=${verification}`,
    ])
  })

  it('falls back to the unverified filter for unknown values', async () => {
    await renderPage({ verification: 'bogus' })

    expect(getAdminOAuthClientsMock).toHaveBeenCalledWith(
      expect.objectContaining({ verification: 'unverified' }),
    )
  })

  it('shows an empty row when no apps match the filter', async () => {
    getAdminOAuthClientsMock.mockResolvedValue(emptyPage)
    await renderPage()

    expect(screen.getByText('No OAuth apps match this filter.')).toBeInTheDocument()
  })

  it('links to the next and first pages while keeping the filter', async () => {
    getAdminOAuthClientsMock.mockResolvedValue({
      ...fixturePage,
      page_info: { ...fixturePage.page_info, has_next_page: true },
    })
    await renderPage({ verification: 'all', after: 'cursor-1' })

    expect(getAdminOAuthClientsMock).toHaveBeenCalledWith({
      verification: 'all',
      after: 'cursor-1',
      limit: 25,
    })
    expect(pagination()).toHaveAttribute('data-previous', '/admin/oauth-clients?verification=all')
    expect(pagination()).toHaveAttribute(
      'data-next',
      '/admin/oauth-clients?verification=all&after=fixture-admin-oauth-client-end-cursor',
    )
  })
})
