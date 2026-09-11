export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { PreferencesForm } from '@/components/my/preferences-form'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { getTranslations } from '@/lib/i18n/get-translations'

export const metadata: Metadata = createNoIndexMetadata('Display Preferences')

export default async function PreferencesPage() {
  const t = await getTranslations()
  const currentUser = await requireCurrentUser()

  return (
    <div className='space-y-6'>
      <SettingsPageHeader
        title={t('extracted.preferences.page.display_34e108c0')}
        description={t('extracted.preferences.page.customizeYourBrowsingExperience_99eaeb2e')}
      />
      <PreferencesForm
        userId={currentUser.id}
        hnDiscussionsEnabled={currentUser.hn_discussions === true}
      />
    </div>
  )
}
