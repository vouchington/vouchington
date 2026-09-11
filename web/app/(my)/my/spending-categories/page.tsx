export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getMySpendingCategories } from '@/lib/api/server'

export const metadata: Metadata = createNoIndexMetadata('Spending Categories')
import { SpendingCategoriesManager } from '@/components/my/spending-categories-manager'
import { getTranslations } from '@/lib/i18n/get-translations'

export default async function SpendingCategoriesPage() {
  const t = await getTranslations()
  const data = await getMySpendingCategories({ limit: 25 })

  return (
    <div className='space-y-6'>
      <div>
        <h1
          className='text-2xl font-bold'
          data-pw='spending-categories-heading'
        >
          {t('extracted.spendingCategories.page.spendingCategories_3ed30dfb')}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('extracted.spendingCategories.page.manageYourSpendingCategoriesAndAmounts_72fd1919')}
        </p>
      </div>

      <SpendingCategoriesManager initialData={data} />
    </div>
  )
}
