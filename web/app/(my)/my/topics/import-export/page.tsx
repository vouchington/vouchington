export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { ImportExportPage } from '@/components/my/import-export/import-export-page'
import { getTranslations } from '@/lib/i18n/get-translations'

export const metadata: Metadata = createNoIndexMetadata('Import/Export Topics')

export default async function TopicsImportExportPage() {
  const t = await getTranslations()
  return (
    <ImportExportPage
      title={t('extracted.importExport.page.importExportTopics_30cb486c')}
      description={t('extracted.importExport.page.importOrExportYourFollowedTopics_c5d6e7f8')}
      feedType='topics'
    />
  )
}
