export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { PointValuationsManager } from '@/components/my/point-valuations-manager'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { getMyRewardsProgramPointValuations } from '@/lib/api/server'
import { getTranslations } from '@/lib/i18n/get-translations'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = createNoIndexMetadata('Point Valuations')

export default async function PointValuationsPage() {
  const t = await getTranslations()
  const data = await getMyRewardsProgramPointValuations({ limit: 25 })

  return (
    <div className='space-y-6'>
      <SettingsPageHeader
        title={t('extracted.rewardsProgramPointValuations.page.pointValuations_f90821b2')}
        description={t(
          'extracted.rewardsProgramPointValuations.page.manageYourRewardsProgramPointValuations_e3bcc429',
        )}
      />

      <PointValuationsManager initialData={data} />
    </div>
  )
}
