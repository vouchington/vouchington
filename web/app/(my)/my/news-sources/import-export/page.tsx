export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { ImportExportPage } from '@/components/my/import-export/import-export-page'
import { getTranslations } from '@/lib/i18n/get-translations'

export const metadata: Metadata = createNoIndexMetadata('Import/Export News Sources')

export default async function NewsSourcesImportExportPage() {
  const t = await getTranslations()
  return (
    <ImportExportPage
      title={t('extracted.importExport.page.importExportNewsSources_bf1ec4ca')}
      description={t('extracted.importExport.page.importOrExportYourFollowedNews_31e9abc8')}
      feedType='article'
    />
  )
}
