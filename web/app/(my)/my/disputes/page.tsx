import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getReviewDisputes } from '@/lib/api/server/disputes'
import { DisputesClient } from '@/components/disputes/disputes-client'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('My Disputes')

export default async function MyDisputesPage() {
  const t = await getTranslations()
  const [data, currentUser] = await Promise.all([
    getReviewDisputes({ searchParams: { limit: 50, mine: true } }),
    getCurrentUser(),
  ])

  return (
    <>
      <Breadcrumbs
        items={buildBreadcrumbsForPath('/my/disputes', {
          isAuthenticated: !!currentUser,
          tail: [{ name: 'My Disputes', path: '/my/disputes' }],
        })}
      />
      <div className='mt-4 space-y-4'>
        <SettingsPageHeader
          title={t('extracted.disputes.page.myReviewDisputes_50765f73')}
          description={t('extracted.disputes.page.trackDisputesYouHaveFiledAs_2d3e4f5a')}
        />
        <DisputesClient
          viewerTier='member'
          data={data}
          mine
        />
      </div>
    </>
  )
}
