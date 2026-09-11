export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getMyRewardsProgramPointValuations } from '@/lib/api/server'

export const metadata: Metadata = createNoIndexMetadata('Point Valuations')
import { PointValuationsManager } from '@/components/my/point-valuations-manager'
import { getTranslations } from '@/lib/i18n/get-translations'

export default async function PointValuationsPage() {
  const t = await getTranslations()
  const data = await getMyRewardsProgramPointValuations({ limit: 25 })

  return (
    <div className='space-y-6'>
      <div>
        <h1
          className='text-2xl font-bold'
          data-pw='point-valuations-heading'
        >
          {t('extracted.rewardsProgramPointValuations.page.pointValuations_f90821b2')}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t(
            'extracted.rewardsProgramPointValuations.page.manageYourRewardsProgramPointValuations_e3bcc429',
          )}
        </p>
      </div>

      <PointValuationsManager initialData={data} />
    </div>
  )
}
