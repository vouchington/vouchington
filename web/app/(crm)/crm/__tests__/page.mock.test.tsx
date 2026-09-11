import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { getAdminCrmContacts } from '@/lib/api/server/crm'

vi.mock(import('@/lib/api/server/crm'), () => ({
  getAdminCrmContacts: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))
vi.mock(import('@/lib/i18n/get-resolved-ui-locale'), () => ({
  getResolvedUiLocale: vi.fn<VitestLooseMock>(() => Promise.resolve('en')),
}))
vi.mock(import('@/components/ui/breadcrumb'), () => ({ Breadcrumbs: () => null }))
vi.mock(import('@/components/admin/admin-page-header'), () => ({
  AdminPageHeader: ({ title, children }: { title: string; children?: ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {children}
    </header>
  ),
}))
vi.mock(
  import('@/components/admin/admin-pagination'),
  () =>
    ({
      AdminPagination: ({
        previousHref,
        nextHref,
      }: {
        previousHref: string | null
        nextHref: string | null
      }) => (
        <nav>
          <span data-testid='previous-href'>{previousHref ?? ''}</span>
          <span data-testid='next-href'>{nextHref ?? ''}</span>
        </nav>
      ),
    }) as unknown as typeof import('@/components/admin/admin-pagination'),
)
vi.mock(import('@/components/admin/admin-table-shell'), () => ({
  AdminTableShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock(
  import('../crm-contacts-filter'),
  () => ({ CrmContactsFilter: () => null }) as unknown as typeof import('../crm-contacts-filter'),
)
vi.mock(
  import('../crm-csv-import-dialog'),
  () =>
    ({ CrmCsvImportDialog: () => null }) as unknown as typeof import('../crm-csv-import-dialog'),
)
vi.mock(import('../[contactId]/crm-contact-status-badge'), () => ({
  CrmContactStatusBadge: () => <span>Status</span>,
}))

import CrmPage from '../page'

describe('CrmPage', () => {
  it('builds the previous pagination URL without stale query params', async () => {
    vi.mocked(getAdminCrmContacts).mockResolvedValueOnce({
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })

    render(await CrmPage({ searchParams: Promise.resolve({ after: 'cursor-1' }) }))

    expect(screen.getByRole('heading', { name: 'CRM Contacts' })).toBeInTheDocument()
    expect(screen.getByTestId('previous-href')).toHaveTextContent('/crm')
  })
})
