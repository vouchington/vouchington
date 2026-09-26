export const dynamic = 'force-dynamic'

import { ApiKeysManager } from '@/components/my/api-keys-manager'
import { OAuthAppsManager } from '@/components/my/oauth-apps-manager'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { getTranslations } from '@/lib/i18n/get-translations'
import { getMyApiKeys, getMyOAuthApps, getScopeCatalog } from '@/lib/api/server'

export const metadata = createNoIndexMetadata('API Keys')

export default async function ApiKeysPage() {
  const t = await getTranslations()
  const [apiKeys, scopeCatalog, oauthApps] = await Promise.all([
    getMyApiKeys(),
    getScopeCatalog(),
    getMyOAuthApps(),
  ])
  return (
    <div className='space-y-6'>
      <SettingsPageHeader
        title={t('extracted.apiKeys.page.apiKeys_c08f17eb')}
        description={t('extracted.apiKeys.page.manageYourApiKeysForAccessing_1b2c3d4e')}
      />
      <ApiKeysManager
        initialData={apiKeys}
        scopeCatalog={scopeCatalog.scopes}
      />
      <OAuthAppsManager
        initialData={oauthApps}
        scopeCatalog={scopeCatalog.scopes}
      />
    </div>
  )
}
