export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { isUUID } from '@ts-shared/utils/validation-core'
import { notFound, permanentRedirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminTableShell } from '@/components/admin/admin-table-shell'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { requireAdmin } from '@/lib/auth/require-admin'
import { serverApi } from '@/lib/api/server'
import type {
  CommunityResponseBody,
  ModlogResponseBody,
  UserResponseBody,
} from '@/types/api-responses'
import { getTranslations } from '@/lib/i18n/get-translations'
import { getUserLabel } from '@/lib/users/user-helpers'
import { ModlogFilters } from '@/components/admin/modlog-filters'
import { returnNullForMissingEntity } from '@/lib/api/return-null-for-missing-entity'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return createNoIndexMetadata(t('extracted.modlog.page.modLogAdmin'))
}

export default async function AdminModlogPage({
  searchParams,
}: {
  searchParams: Promise<{
    after?: string
    community?: string
    actor?: string
    community_id?: string
    actor_user_id?: string
  }>
}) {
  await requireAdmin()
  const t = await getTranslations()
  const params = await searchParams
  const requestedCommunity = params.community === undefined ? params.community_id : params.community
  const requestedActor = params.actor === undefined ? params.actor_user_id : params.actor
  const [community, actor] = await Promise.all([
    requestedCommunity
      ? returnNullForMissingEntity(
          serverApi.get<CommunityResponseBody>(
            `/api/v1/communities/${encodeURIComponent(requestedCommunity)}`,
          ),
        )
      : null,
    requestedActor
      ? returnNullForMissingEntity(
          serverApi.get<UserResponseBody>(`/api/v1/users/${encodeURIComponent(requestedActor)}`),
        )
      : null,
  ])
  if (requestedCommunity && !community?.community.slug && !isUUID(requestedCommunity)) notFound()
  if (requestedActor && !actor?.user.username && !isUUID(requestedActor)) notFound()
  const communityId = community?.community.id ?? (requestedCommunity || undefined)
  const actorId = actor?.user.id ?? (requestedActor || undefined)
  const filters = {
    community: community?.community.slug || undefined,
    actor: actor?.user.username || undefined,
    community_id: community?.community.slug ? undefined : communityId,
    actor_user_id: actor?.user.username ? undefined : actorId,
  }
  if (
    (filters.community &&
      (params.community_id !== undefined || requestedCommunity !== filters.community)) ||
    (filters.actor && (params.actor_user_id !== undefined || requestedActor !== filters.actor))
  )
    permanentRedirect(buildPageUrl(filters, params.after))

  const data = await serverApi.get<ModlogResponseBody>('/api/v1/admin/modlog', {
    searchParams: {
      after: params.after,
      community_id: communityId,
      actor_user_id: actorId,
      limit: 25,
    },
  })

  const breadcrumbItems = buildBreadcrumbsForPath('/admin/modlog', {
    isAuthenticated: true,
    userRoles: ['administrator'],
    tail: [{ name: t('extracted.modlog.page.modLog_7d4b507b'), path: '/admin/modlog' }],
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
      <ModlogFilters
        community={filters.community}
        actor={filters.actor}
        communityId={filters.community_id}
        actorId={filters.actor_user_id}
      />
      <AdminTableShell aria-label={t('extracted.modlog.page.modLog_7d4b507b')}>
        <table className='min-w-full divide-y divide-border'>
          <thead className='bg-muted/50'>
            <tr>
              {[
                t('extracted.modlog.page.date_99c40ab4'),
                t('extracted.modlog.page.actor_449995c4'),
                t('extracted.modlog.page.action_64cff131'),
                t('extracted.modlog.page.reason_f81ab834'),
              ].map(label => (
                <th
                  scope='col'
                  key={label}
                  className='px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
                >
                  {label}
                </th>
              ))}
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
              const actor = action.actor_user_id ? data.users[action.actor_user_id] : null
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
                    {action.actor_user_id
                      ? getUserLabel(actor, t('shared.user.deletedUser'))
                      : t('extracted.modlog.page.system_7a4d2e63')}
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
        previousHref={params.after ? buildPageUrl(filters, undefined) : null}
        nextHref={
          data.page_info.has_next_page && data.page_info.end_cursor
            ? buildPageUrl(filters, data.page_info.end_cursor)
            : null
        }
      />
    </div>
  )
}

function buildPageUrl(
  params: Record<string, string | undefined>,
  after: string | undefined,
): string {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) searchParams.set(key, value)
  if (after) searchParams.set('after', after)
  const qs = searchParams.toString()
  return qs ? `/admin/modlog?${qs}` : '/admin/modlog'
}
