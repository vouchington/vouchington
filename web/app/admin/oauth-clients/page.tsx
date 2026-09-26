export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminTableShell } from '@/components/admin/admin-table-shell'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { OAuthClientVerificationRow } from '@/components/admin/oauth-clients/oauth-client-verification-row'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getAdminOAuthClients } from '@/lib/api/server'
import { getTranslations } from '@/lib/i18n/get-translations'
import type { OAuthClientVerificationFilter } from '@/types/oauth-apps'

export const metadata: Metadata = createNoIndexMetadata('OAuth Apps | Admin')

const PATH = '/admin/oauth-clients'

export default async function AdminOAuthClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string; verification?: string }>
}) {
  const t = await getTranslations()
  await requireAdmin()
  const params = await searchParams
  const verification = parseVerificationFilter(params.verification)

  const data = await getAdminOAuthClients({ verification, after: params.after, limit: 25 })

  const filters: readonly { value: OAuthClientVerificationFilter; label: string }[] = [
    { value: 'unverified', label: t('extracted.oauthClients.page.unverified_33c8e8de') },
    { value: 'verified', label: t('extracted.oauthClients.page.verified_4f783840') },
    { value: 'all', label: t('extracted.oauthClients.page.all_a52ace42') },
  ]
  const columns = [
    t('extracted.oauthClients.page.app_0d04bfeb'),
    t('extracted.oauthClients.page.owner_4b1b8aa3'),
    t('extracted.oauthClients.page.redirectUris_721353f1'),
    t('extracted.oauthClients.page.scopes_0d5644ff'),
    t('extracted.oauthClients.page.status_920e413c'),
    t('extracted.oauthClients.page.action_64cff131'),
  ]
  const breadcrumbItems = buildBreadcrumbsForPath(PATH, {
    isAuthenticated: true,
    userRoles: ['administrator'],
    tail: [{ name: 'OAuth Apps', path: PATH }],
  })

  return (
    <div
      className='space-y-4'
      data-pw='admin-oauth-clients-heading'
    >
      <Breadcrumbs items={breadcrumbItems} />
      <AdminPageHeader
        title={t('extracted.oauthClients.page.oauthApps_ed52067f')}
        description={t('extracted.oauthClients.page.reviewASelfRegisteredAppS_7845c39a')}
      >
        <ButtonGroup aria-label={t('extracted.oauthClients.page.verificationStatus_aedfff7e')}>
          {filters.map(filter => (
            <Button
              key={filter.value}
              asChild
              variant={filter.value === verification ? 'secondary' : 'outline'}
              size='touchSm'
            >
              <Link
                href={buildPageUrl(filter.value, undefined)}
                prefetch={false}
                aria-current={filter.value === verification ? 'page' : undefined}
                // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from filter config
                data-pw={`admin-oauth-clients-filter-${filter.value}`}
              >
                {filter.label}
              </Link>
            </Button>
          ))}
        </ButtonGroup>
      </AdminPageHeader>
      <AdminTableShell aria-label={t('extracted.oauthClients.page.oauthApps_ed52067f')}>
        <table className='min-w-full divide-y divide-border'>
          <thead className='bg-muted/50'>
            <tr>
              {columns.map(column => (
                <th
                  key={column}
                  scope='col'
                  className='px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className='divide-y divide-border bg-card'>
            {data.results.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className='px-4 py-8 text-center text-sm text-muted-foreground'
                >
                  {t('extracted.oauthClients.page.noOauthAppsMatchThisFilter_bb0355d6')}
                </td>
              </tr>
            )}
            {data.results.map(client => (
              <OAuthClientVerificationRow
                key={client.id}
                client={client}
              />
            ))}
          </tbody>
        </table>
      </AdminTableShell>
      <AdminPagination
        previousHref={params.after ? buildPageUrl(verification, undefined) : null}
        nextHref={
          data.page_info.has_next_page && data.page_info.end_cursor
            ? buildPageUrl(verification, data.page_info.end_cursor)
            : null
        }
      />
    </div>
  )
}

function parseVerificationFilter(value: string | undefined): OAuthClientVerificationFilter {
  return value === 'all' || value === 'verified' ? value : 'unverified'
}

function buildPageUrl(
  verification: OAuthClientVerificationFilter,
  after: string | undefined,
): string {
  const searchParams = new URLSearchParams({ verification })
  if (after) searchParams.set('after', after)
  return `${PATH}?${searchParams.toString()}`
}
