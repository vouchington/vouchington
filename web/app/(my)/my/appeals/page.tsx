import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getModerationAppeals } from '@/lib/api/server/appeals'
import { AppealsClient } from '@/components/appeals/appeals-client'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('My Appeals')

export default async function MyAppealsPage() {
  const t = await getTranslations()
  const [data, currentUser] = await Promise.all([
    getModerationAppeals({ searchParams: { limit: 50, mine: true } }),
    getCurrentUser(),
  ])

  return (
    <>
      <Breadcrumbs
        items={buildBreadcrumbsForPath('/my/appeals', {
          isAuthenticated: !!currentUser,
          tail: [{ name: 'My Appeals', path: '/my/appeals' }],
        })}
      />
      <div className='mt-4 space-y-4'>
        <SettingsPageHeader
          title={t('extracted.appeals.page.myAppeals_1e44b863')}
          description={t('extracted.appeals.page.trackAppealsYouHaveFiledAgainst_2c3d4e5f')}
        />
        <AppealsClient
          viewerTier='member'
          data={data}
          mine
        />
      </div>
    </>
  )
}
