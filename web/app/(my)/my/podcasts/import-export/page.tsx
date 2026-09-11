export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { ImportExportPage } from '@/components/my/import-export/import-export-page'
import { getTranslations } from '@/lib/i18n/get-translations'

export const metadata: Metadata = createNoIndexMetadata('Import/Export Podcasts')

export default async function PodcastsImportExportPage() {
  const t = await getTranslations()
  return (
    <ImportExportPage
      title={t('extracted.importExport.page.importExportPodcasts_6aff6305')}
      description={t('extracted.importExport.page.importOrExportYourFollowedPodcasts_ec30e0e5')}
      feedType='podcast'
    />
  )
}
