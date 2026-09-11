import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { getAdminCrmContacts } from '@/lib/api/server/crm'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { CrmContactsFilter } from './crm-contacts-filter'
import { CrmCsvImportDialog } from './crm-csv-import-dialog'
import { CrmContactStatusBadge } from './[contactId]/crm-contact-status-badge'
import { deriveCrmContactStatus } from './[contactId]/crm-contact-status'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { AdminTableShell } from '@/components/admin/admin-table-shell'
import { getResolvedUiLocale } from '@/lib/i18n/get-resolved-ui-locale'
import { crmContactHref } from '@/lib/links/entity-href'
import { formatNumber } from '@ts-shared/utils/format'
import type { CrmContactVertical } from '@/types/crm'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('CRM | Admin')

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    status?: string
    vertical?: string
    after?: string
  }>
}) {
  const t = await getTranslations()
  const params = await searchParams
  const VERTICAL_LABELS: Record<CrmContactVertical, string> = {
    credit_cards: t('extracted.crm.page.creditCards_b6e1af02'),
    travel: t('extracted.crm.page.travel_f2a97c14'),
    cars: t('extracted.crm.page.cars_3d8b6e51'),
    ai: t('extracted.crm.page.ai_c94a1f7d'),
    technology: t('extracted.crm.page.technology_5e2b0d8a'),
    finance: t('extracted.crm.page.finance_a1c3f92e'),
    lifestyle: t('extracted.crm.page.lifestyle_8f04b6d3'),
    other: t('extracted.crm.page.other_2c7e9a41'),
  }
  const [data, uiLocale] = await Promise.all([
    getAdminCrmContacts({
      searchParams: {
        q: params.q,
        status: params.status,
        vertical: params.vertical,
        after: params.after,
        limit: 25,
      },
    }),
    getResolvedUiLocale(),
  ])

  const breadcrumbItems = buildBreadcrumbsForPath('/crm', {
    isAuthenticated: true,
    userRoles: ['administrator'],
    tail: [{ name: 'CRM', path: '/crm' }],
  })

  return (
    <div className='space-y-4'>
      <Breadcrumbs items={breadcrumbItems} />
      <AdminPageHeader
        title={t('extracted.crm.page.crmContacts_03e3fa78')}
        description={t('extracted.crm.page.manageInfluencerOutreachAnd_4d8e2a71')}
      >
        <CrmCsvImportDialog />
      </AdminPageHeader>

      <CrmContactsFilter />

      <AdminTableShell aria-label={t('extracted.crm.page.crmContacts_03e3fa78')}>
        <table className='min-w-full divide-y divide-border'>
          <thead className='bg-muted/50'>
            <tr>
              <th
                scope='col'
                className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
              >
                {t('extracted.crm.page.name_dcd1d522')}
              </th>
              <th
                scope='col'
                className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
              >
                {t('extracted.crm.page.email_969ccbd3')}
              </th>
              <th
                scope='col'
                className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
              >
                {t('extracted.crm.page.vertical_727cd3a6')}
              </th>
              <th
                scope='col'
                className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
              >
                {t('extracted.crm.page.status_920e413c')}
              </th>
              <th
                scope='col'
                className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
              >
                {t('extracted.crm.page.followers_a145ab34')}
              </th>
              <th
                scope='col'
                className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
              >
                {t('extracted.crm.page.lastContacted_35412e53')}
              </th>
            </tr>
          </thead>
          <tbody className='divide-y divide-border bg-card'>
            {data.results.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className='px-6 py-8 text-center text-sm text-muted-foreground'
                >
                  {t('extracted.crm.page.noContactsFound_0013e698')}
                </td>
              </tr>
            )}
            {data.results.map(contact => {
              const status = deriveCrmContactStatus(contact)
              return (
                <tr key={contact.id}>
                  <td className='whitespace-nowrap px-6 py-4 text-sm font-medium text-foreground'>
                    <Link
                      prefetch={false}
                      href={crmContactHref(contact)}
                      // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
                      data-pw={`crm-contact-link-${contact.id}`}
                      className='text-primary hover:text-primary/80'
                    >
                      {contact.name}
                    </Link>
                  </td>
                  <td className='whitespace-nowrap px-6 py-4 text-sm text-muted-foreground'>
                    {contact.email}
                  </td>
                  <td className='whitespace-nowrap px-6 py-4 text-sm text-muted-foreground'>
                    {contact.vertical ? VERTICAL_LABELS[contact.vertical] : '—'}
                  </td>
                  <td className='whitespace-nowrap px-6 py-4 text-sm'>
                    <CrmContactStatusBadge status={status} />
                  </td>
                  <td className='whitespace-nowrap px-6 py-4 text-sm text-muted-foreground'>
                    {contact.follower_count != null
                      ? formatNumber(contact.follower_count, uiLocale)
                      : '—'}
                  </td>
                  <td
                    className='whitespace-nowrap px-6 py-4 text-sm text-muted-foreground'
                    suppressHydrationWarning
                  >
                    {contact.contacted_at
                      ? new Date(contact.contacted_at).toLocaleDateString()
                      : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </AdminTableShell>

      <AdminPagination
        previousHref={params.after ? buildPageUrl(params, undefined) : null}
        nextHref={
          data.page_info.has_next_page && data.page_info.end_cursor
            ? buildPageUrl(params, data.page_info.end_cursor)
            : null
        }
      />
    </div>
  )
}

function buildPageUrl(
  params: { q?: string; status?: string; vertical?: string },
  after: string | undefined,
): string {
  const p = new URLSearchParams()
  if (params.q) p.set('q', params.q)
  if (params.status) p.set('status', params.status)
  if (params.vertical) p.set('vertical', params.vertical)
  if (after) p.set('after', after)
  const qs = p.toString()
  return qs ? `/crm?${qs}` : '/crm'
}
