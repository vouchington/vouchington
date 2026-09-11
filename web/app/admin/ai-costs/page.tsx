export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { AdminTableShell } from '@/components/admin/admin-table-shell'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getAiCostTotals } from '@/lib/api/server/ai-costs'
import { getResolvedUiLocale } from '@/lib/i18n/get-resolved-ui-locale'
import { getTranslations } from '@/lib/i18n/get-translations'
import { formatScaledMoneyAggregate } from '@/lib/money'

export const metadata: Metadata = createNoIndexMetadata('AI Costs | Admin')

export default async function AdminAiCostsPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string }>
}) {
  const [t, , uiLocale] = await Promise.all([
    getTranslations(),
    requireAdmin(),
    getResolvedUiLocale(),
  ])
  const params = await searchParams
  const data = await getAiCostTotals({ after: params.after, limit: 25 })
  const { results } = data

  const breadcrumbItems = buildBreadcrumbsForPath('/admin/ai-costs', {
    isAuthenticated: true,
    userRoles: ['administrator'],
    tail: [{ name: 'AI Costs', path: '/admin/ai-costs' }],
  })

  return (
    <div
      className='space-y-4'
      data-pw='admin-ai-costs'
    >
      <Breadcrumbs items={breadcrumbItems} />
      <AdminPageHeader
        title={t('extracted.aiCosts.page.aiCosts_75cce222')}
        description={t('extracted.aiCosts.page.perCommunityLlmModerationUsage_4d9a2c81')}
      />
      <AdminTableShell aria-label={t('extracted.aiCosts.page.aiCosts_75cce222')}>
        <table className='min-w-full divide-y divide-border'>
          <thead className='bg-muted/50'>
            <tr>
              <th
                scope='col'
                className='px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
              >
                {t('extracted.aiCosts.page.community_bb501d78')}
              </th>
              <th
                scope='col'
                className='px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground'
              >
                {t('extracted.aiCosts.page.requests_ada27592')}
              </th>
              <th
                scope='col'
                className='px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground'
              >
                {t('extracted.aiCosts.page.inputTokens_c54a41f6')}
              </th>
              <th
                scope='col'
                className='px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground'
              >
                {t('extracted.aiCosts.page.outputTokens_a0a1074f')}
              </th>
              <th
                scope='col'
                className='px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground'
              >
                {t('extracted.aiCosts.page.totalCostUsd_eed03fbf')}
              </th>
            </tr>
          </thead>
          <tbody className='divide-y divide-border bg-background'>
            {results.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className='px-4 py-6 text-center text-sm text-muted-foreground'
                  data-pw='admin-ai-costs-empty'
                >
                  {t('extracted.aiCosts.page.noAiUsageRecordedYet_87b1e2ea')}
                </td>
              </tr>
            ) : (
              results.map(row => (
                <tr
                  key={row.community_id}
                  data-pw='admin-ai-costs-row'
                >
                  <td className='px-4 py-3 text-sm font-medium'>{row.community_slug}</td>
                  <td className='px-4 py-3 text-right text-sm tabular-nums'>
                    {row.request_count.toLocaleString(uiLocale)}
                  </td>
                  <td className='px-4 py-3 text-right text-sm tabular-nums'>
                    {row.total_input_tokens.toLocaleString(uiLocale)}
                  </td>
                  <td className='px-4 py-3 text-right text-sm tabular-nums'>
                    {row.total_output_tokens.toLocaleString(uiLocale)}
                  </td>
                  <td className='px-4 py-3 text-right text-sm tabular-nums'>
                    {formatScaledMoneyAggregate(row.total_cost, uiLocale)}
                    {row.unpriced_request_count > 0
                      ? ` (${t('extracted.aiCosts.page.unpricedRequestCount', {
                          count: row.unpriced_request_count,
                        })})`
                      : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </AdminTableShell>
      <AdminPagination
        previousHref={params.after ? '/admin/ai-costs' : null}
        nextHref={
          data.page_info.has_next_page && data.page_info.end_cursor
            ? buildAiCostsPageUrl(data.page_info.end_cursor)
            : null
        }
      />
    </div>
  )
}

function buildAiCostsPageUrl(after: string): string {
  const params = new URLSearchParams({ after })
  return `/admin/ai-costs?${params.toString()}`
}
