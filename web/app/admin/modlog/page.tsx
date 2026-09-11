export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminTableShell } from '@/components/admin/admin-table-shell'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { requireAdmin } from '@/lib/auth/require-admin'
import { serverApi } from '@/lib/api/server'
import type { ModlogResponseBody } from '@/types/api-responses'
import { getTranslations } from '@/lib/i18n/get-translations'

export const metadata: Metadata = createNoIndexMetadata('Mod Log | Admin')

export default async function AdminModlogPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string; community_id?: string; actor_id?: string }>
}) {
  const t = await getTranslations()
  await requireAdmin()
  const params = await searchParams

  const data = await serverApi.get<ModlogResponseBody>('/api/v1/admin/modlog', {
    searchParams: {
      after: params.after,
      community_id: params.community_id,
      actor_id: params.actor_id,
      limit: 25,
    },
  })

  const breadcrumbItems = buildBreadcrumbsForPath('/admin/modlog', {
    isAuthenticated: true,
    userRoles: ['administrator'],
    tail: [{ name: 'Mod Log', path: '/admin/modlog' }],
  })

  return (
    <div
      className='space-y-4'
      data-pw='admin-modlog-heading'
    >
      <Breadcrumbs items={breadcrumbItems} />
      <AdminPageHeader
        title={t('extracted.modlog.page.modLog_7d4b507b')}
        description={t('extracted.modlog.page.unifiedAuditLogOfModerator_2c8e5a91')}
      />
      <AdminTableShell aria-label={t('extracted.modlog.page.modLog_7d4b507b')}>
        <table className='min-w-full divide-y divide-border'>
          <thead className='bg-muted/50'>
            <tr>
              <th
                scope='col'
                className='px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
              >
                {t('extracted.modlog.page.date_99c40ab4')}
              </th>
              <th
                scope='col'
                className='px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
              >
                {t('extracted.modlog.page.actor_449995c4')}
              </th>
              <th
                scope='col'
                className='px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
              >
                {t('extracted.modlog.page.action_64cff131')}
              </th>
              <th
                scope='col'
                className='px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
              >
                {t('extracted.modlog.page.reason_f81ab834')}
              </th>
            </tr>
          </thead>
          <tbody className='divide-y divide-border bg-card'>
            {data.results.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className='px-4 py-8 text-center text-sm text-muted-foreground'
                >
                  {t('extracted.modlog.page.noModerationActionsFound_1114e3ce')}
                </td>
              </tr>
            )}
            {data.results.map(result => {
              const action = data.moderator_actions[result.id]
              if (!action) return null
              const actor = action.actor_id ? data.users[action.actor_id] : null
              return (
                <tr
                  key={action.id}
                  data-pw='admin-modlog-row'
                >
                  <td
                    className='whitespace-nowrap px-4 py-3 text-sm text-muted-foreground'
                    suppressHydrationWarning
                  >
                    {action.created_at.split('T')[0]}
                  </td>
                  <td className='px-4 py-3 text-sm'>
                    {actor?.username
                      ? `@${actor.username}`
                      : (action.actor_id ?? t('extracted.modlog.page.system_7a4d2e63'))}
                  </td>
                  <td className='px-4 py-3 text-sm font-mono text-xs'>{action.action_type}</td>
                  <td className='px-4 py-3 text-sm text-muted-foreground'>
                    {action.reason ?? t('extracted.modlog.page.emDash_9b3f6c14')}
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
  params: { community_id?: string; actor_id?: string },
  after: string | undefined,
): string {
  const searchParams = new URLSearchParams()
  if (params.community_id) searchParams.set('community_id', params.community_id)
  if (params.actor_id) searchParams.set('actor_id', params.actor_id)
  if (after) searchParams.set('after', after)
  const qs = searchParams.toString()
  return qs ? `/admin/modlog?${qs}` : '/admin/modlog'
}
