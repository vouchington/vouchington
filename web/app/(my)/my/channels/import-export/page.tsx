export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { ImportExportPage } from '@/components/my/import-export/import-export-page'
import { getTranslations } from '@/lib/i18n/get-translations'

export const metadata: Metadata = createNoIndexMetadata('Import/Export Channels')

export default async function ChannelsImportExportPage() {
  const t = await getTranslations()
  return (
    <ImportExportPage
      title={t('extracted.importExport.page.importExportChannels_8ab0e50a')}
      description={t('extracted.importExport.page.importOrExportYourFollowedYoutube_4c13167e')}
      feedType='video'
    />
  )
}
