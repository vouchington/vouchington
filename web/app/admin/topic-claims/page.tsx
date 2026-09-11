import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getPendingTopicClaims } from '@/lib/api/server/topic-claims'
import { TopicClaimReview } from '@/components/admin/topic-claim-review'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Topic Claims | Admin')

export default async function AdminTopicClaimsPage() {
  const [t] = await Promise.all([getTranslations(), requireAdmin()])
  const data = await getPendingTopicClaims()

  const breadcrumbItems = buildBreadcrumbsForPath('/admin/topic-claims', {
    isAuthenticated: true,
    userRoles: ['administrator'],
    tail: [{ name: 'Topic Claims', path: '/admin/topic-claims' }],
  })

  return (
    <>
      <Breadcrumbs items={breadcrumbItems} />
      <div
        className='mt-4 space-y-4'
        data-pw='admin-topic-claims'
      >
        <AdminPageHeader
          title={t('extracted.topicClaims.page.topicClaims_105cfd52')}
          description={t('extracted.topicClaims.page.reviewAndApproveOwnershipClaimsFor_181dccb1')}
        />
        {data.claims.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('extracted.topicClaims.page.noPendingClaims_4471eb3b')}
          </p>
        ) : (
          <div className='space-y-3'>
            {data.claims.map(claim => (
              <TopicClaimReview
                key={claim.id}
                claim={claim}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
