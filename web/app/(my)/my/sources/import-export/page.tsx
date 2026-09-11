export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { ImportExportPage } from '@/components/my/import-export/import-export-page'
import { getTranslations } from '@/lib/i18n/get-translations'

export const metadata: Metadata = createNoIndexMetadata('Import/Export Sources')

export default async function SourcesImportExportPage() {
  const t = await getTranslations()
  return (
    <ImportExportPage
      title={t('extracted.importExport.page.importExportSources_7b7ffe10')}
      description={t('extracted.importExport.page.importOrExportYourFollowedSources_8192a3b4')}
      feedType='all'
    />
  )
}
