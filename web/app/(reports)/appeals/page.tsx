import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getModerationAppeals } from '@/lib/api/server/appeals'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { AppealsClient } from '@/components/appeals/appeals-client'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Moderation Appeals')

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ModerationAppealsPage({ searchParams }: PageProps) {
  const t = await getTranslations()
  const params = await searchParams
  const cursor = typeof params.cursor === 'string' ? params.cursor : undefined
  const statusParam = typeof params.status === 'string' ? params.status : undefined

  const currentUser = await getCurrentUser()
  const isStaff =
    (currentUser?.roles.includes('administrator') ?? false) ||
    (currentUser?.roles.includes('moderator') ?? false)

  const data = await getModerationAppeals({
    searchParams: {
      limit: 50,
      ...(cursor ? { cursor } : {}),
      ...(statusParam ? { status: statusParam } : {}),
    },
  })

  const breadcrumbItems = buildBreadcrumbsForPath('/appeals', {
    isAuthenticated: !!currentUser,
    userRoles: currentUser?.roles ?? [],
    tail: [{ name: 'Moderation Appeals', path: '/appeals' }],
  })

  return (
    <>
      <Breadcrumbs items={breadcrumbItems} />
      <div
        className='mt-4 space-y-4'
        data-pw='appeals-heading'
      >
        <AdminPageHeader
          title={t('extracted.appeals.page.moderationAppeals_3982fa5d')}
          description={
            isStaff
              ? t('extracted.appeals.page.reviewAppealsFiledByMembers_6a2d9f14')
              : t('extracted.appeals.page.appealsAgainstModerationDecisions_8f3b1c72')
          }
        />
        <AppealsClient
          viewerTier={isStaff ? 'staff' : 'member'}
          viewerRole={
            currentUser?.roles.includes('administrator')
              ? 'administrator'
              : currentUser?.roles.includes('moderator')
                ? 'moderator'
                : 'member'
          }
          data={data}
          statusFilter={statusParam}
        />
      </div>
    </>
  )
}
