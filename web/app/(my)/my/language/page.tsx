export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { LanguageForm } from '@/components/my/language-form'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { getTranslations } from '@/lib/i18n/get-translations'
import { requireCurrentUser } from '@/lib/auth/require-current-user'

export const metadata: Metadata = createNoIndexMetadata('Language')

export default async function LanguagePage() {
  const [t, currentUser] = await Promise.all([getTranslations(), requireCurrentUser()])

  return (
    <div className='space-y-6'>
      <SettingsPageHeader
        title={t('settings.language.title')}
        description={t('extracted.language.page.setYourAccountCountryAndInterface_8b9c0d1e')}
      />
      <Suspense fallback={null}>
        <LanguageForm
          initialUser={{
            id: currentUser.id,
            country: currentUser.country ?? null,
            uiLocale: currentUser.ui_locale ?? null,
          }}
        />
      </Suspense>
    </div>
  )
}
