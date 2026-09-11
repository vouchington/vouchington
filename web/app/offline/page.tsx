import { StatusPage } from '@/components/shared/status-page'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata = createNoIndexMetadata('Offline')

export default async function OfflinePage() {
  const t = await getTranslations()
  return (
    <>
      <meta
        name='voucha-offline-fallback'
        content='true'
      />
      <StatusPage
        title={t('extracted.offline.page.offline_a1794783')}
        description={t('extracted.offline.page.youReOfflineRightNowReconnect_6450a16d')}
        status={503}
        t={t}
      />
    </>
  )
}
