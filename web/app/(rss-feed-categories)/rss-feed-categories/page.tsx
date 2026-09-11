import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminTableShell } from '@/components/admin/admin-table-shell'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getAdminRssFeedCategories } from '@/lib/api/server/rss-feed-categories'
import { getResolvedUiLocale } from '@/lib/i18n/get-resolved-ui-locale'
import { formatNumber } from '@ts-shared/utils/format'
import { RssFeedCategoryStatusFilter } from './status-filter'
import { CategoryRowActions } from './category-row-actions'
import type { UnmappedCategoryStatus } from '@/types/rss-feed-categories'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('RSS Feed Categories | Admin')

const VALID_STATUSES = new Set<UnmappedCategoryStatus>(['pending', 'rejected', 'all'])

export default async function RssFeedCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; after?: string }>
}) {
  const t = await getTranslations()
  const params = await searchParams
  const status: UnmappedCategoryStatus =
    params.status && VALID_STATUSES.has(params.status as UnmappedCategoryStatus)
      ? (params.status as UnmappedCategoryStatus)
      : 'pending'

  const [data, uiLocale] = await Promise.all([
    getAdminRssFeedCategories({
      searchParams: { status, after: params.after, limit: 25 },
    }),
    getResolvedUiLocale(),
  ])

  const breadcrumbItems = buildBreadcrumbsForPath('/rss-feed-categories', {
    isAuthenticated: true,
    userRoles: ['administrator'],
    tail: [{ name: 'RSS Feed Categories', path: '/rss-feed-categories' }],
  })

  return (
    <div className='space-y-4'>
      <Breadcrumbs items={breadcrumbItems} />
      <AdminPageHeader
        title={t('extracted.rssFeedCategories.page.rssFeedCategories_1c481b92')}
        description={t(
          'extracted.rssFeedCategories.page.triageUnmappedRssFeedItemCategories_3f8d2b64',
        )}
      />
      <RssFeedCategoryStatusFilter />
      <AdminTableShell
        aria-label={t('extracted.rssFeedCategories.page.rssFeedCategories_1c481b92')}
      >
        <table className='min-w-full divide-y divide-border'>
          <thead className='bg-muted/50'>
            <tr>
              <th
                scope='col'
                className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
              >
                {t('extracted.rssFeedCategories.page.category_292c06f0')}
              </th>
              <th
                scope='col'
                className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
              >
                {t('extracted.rssFeedCategories.page.items_fb8e7a1a')}
              </th>
              <th
                scope='col'
                className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
              >
                {t('extracted.rssFeedCategories.page.actions_ff8059dc')}
              </th>
            </tr>
          </thead>
          <tbody className='divide-y divide-border bg-card'>
            {data.results.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className='px-6 py-8 text-center text-sm text-muted-foreground'
                  data-pw='rss-categories-empty'
                >
                  {t('extracted.rssFeedCategories.page.noCategoriesFound_8b22abca')}
                </td>
              </tr>
            )}
            {data.results.map(category => (
              <tr
                key={category.category_text}
                // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
                data-pw={`rss-category-row-${category.category_text}`}
              >
                <td className='px-6 py-4 text-sm font-medium text-foreground'>
                  <code className='rounded bg-muted px-1.5 py-0.5 text-xs'>
                    {category.category_text}
                  </code>
                </td>
                <td className='whitespace-nowrap px-6 py-4 text-sm tabular-nums text-muted-foreground'>
                  {formatNumber(category.item_count, uiLocale)}
                </td>
                <td className='px-6 py-4'>
                  <CategoryRowActions category={category} />
                </td>
              </tr>
            ))}
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

export function buildPageUrl(params: { status?: string }, after: string | undefined): string {
  const p = new URLSearchParams()
  if (params.status) p.set('status', params.status)
  if (after) p.set('after', after)
  const qs = p.toString()
  return qs ? `/rss-feed-categories?${qs}` : '/rss-feed-categories'
}
