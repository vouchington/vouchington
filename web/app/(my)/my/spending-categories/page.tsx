export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { SpendingCategoriesManager } from '@/components/my/spending-categories-manager'
import { getMySpendingCategories } from '@/lib/api/server'
import { getTranslations } from '@/lib/i18n/get-translations'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = createNoIndexMetadata('Spending Categories')

export default async function SpendingCategoriesPage() {
  const t = await getTranslations()
  const data = await getMySpendingCategories({ limit: 25 })

  return (
    <div className='space-y-6'>
      <SettingsPageHeader
        title={t('extracted.spendingCategories.page.spendingCategories_3ed30dfb')}
        description={t(
          'extracted.spendingCategories.page.manageYourSpendingCategoriesAndAmounts_72fd1919',
        )}
      />

      <SpendingCategoriesManager initialData={data} />
    </div>
  )
}
