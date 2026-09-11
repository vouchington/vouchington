export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getMyCards } from '@/lib/api/server'

export const metadata: Metadata = createNoIndexMetadata('Cards')
import { CardsManager } from '@/components/my/cards-manager'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { getTranslations } from '@/lib/i18n/get-translations'

export default async function CardsPage() {
  const t = await getTranslations()
  const data = await getMyCards({ limit: 25 })

  return (
    <div className='space-y-6'>
      <SettingsPageHeader
        title={t('extracted.cards.page.cards_a52fcbbc')}
        description={t('extracted.cards.page.manageYourCreditAndDebitCards_4e5f6a7b')}
      />

      <CardsManager initialData={data} />
    </div>
  )
}
