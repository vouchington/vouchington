export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { RewardsProgramStatusesManager } from '@/components/my/rewards-program-statuses-manager'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getMyRewardsProgramStatuses } from '@/lib/api/server'
import { getTranslations } from '@/lib/i18n/get-translations'

export const metadata: Metadata = createNoIndexMetadata('Rewards Program Statuses')

export default async function RewardsProgramStatusesPage() {
  const t = await getTranslations()
  const data = await getMyRewardsProgramStatuses({ limit: 25 })

  return (
    <div className='space-y-6'>
      <SettingsPageHeader
        title={t('extracted.rewardsProgramStatuses.page.rewardsProgramStatuses_b2a04de2')}
        description={t(
          'extracted.rewardsProgramStatuses.page.manageYourRewardsProgramTierStatuses_2fdfab17',
        )}
      />

      <RewardsProgramStatusesManager initialPage={data} />
    </div>
  )
}
