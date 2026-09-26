export const dynamic = 'force-dynamic'

import { ConnectedAppsManager } from '@/components/my/connected-apps-manager'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { getMyOAuthGrants } from '@/lib/api/server'
import { getTranslations } from '@/lib/i18n/get-translations'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const metadata = createNoIndexMetadata('Connected Apps')

export default async function ConnectedAppsPage() {
  const t = await getTranslations()
  const initialData = await getMyOAuthGrants()
  return (
    <div className='space-y-6'>
      <SettingsPageHeader
        title={t('extracted.connectedApps.page.connectedApps_4d658e7e')}
        description={t('extracted.connectedApps.page.appsAndAiAgentsYouHave_e33e0d20')}
      />
      <ConnectedAppsManager initialData={initialData} />
    </div>
  )
}
