import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getReviewDisputes } from '@/lib/api/server/disputes'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { DisputesClient } from '@/components/disputes/disputes-client'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Review Disputes')

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ReviewDisputesPage({ searchParams }: PageProps) {
  const t = await getTranslations()
  const params = await searchParams
  const cursor = typeof params.cursor === 'string' ? params.cursor : undefined
  const statusParam = typeof params.status === 'string' ? params.status : undefined

  const currentUser = await getCurrentUser()
  const isStaff =
    (currentUser?.roles.includes('administrator') ?? false) ||
    (currentUser?.roles.includes('moderator') ?? false)

  const data = await getReviewDisputes({
    searchParams: {
      limit: 50,
      ...(cursor ? { cursor } : {}),
      ...(statusParam ? { status: statusParam } : {}),
    },
  })

  const breadcrumbItems = buildBreadcrumbsForPath('/disputes', {
    isAuthenticated: !!currentUser,
    userRoles: currentUser?.roles ?? [],
    tail: [{ name: 'Review Disputes', path: '/disputes' }],
  })

  return (
    <>
      <Breadcrumbs items={breadcrumbItems} />
      <div
        className='mt-4 space-y-4'
        data-pw='disputes-heading'
      >
        <AdminPageHeader
          title={t('extracted.disputes.page.reviewDisputes_25c25858')}
          description={
            isStaff
              ? t('extracted.disputes.page.reviewDisputesFiledByVerified_4c9e2a56')
              : t('extracted.disputes.page.disputesFiledAgainstReviewsOnThis_2b7f8d31')
          }
        />
        <DisputesClient
          viewerTier={isStaff ? 'staff' : 'member'}
          data={data}
          statusFilter={statusParam}
        />
      </div>
    </>
  )
}
