import type { Metadata } from 'next'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { getMyWarnings } from '@/lib/api/server'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { MyWarningsClient } from './my-warnings-client'
import { projectMyWarnings } from './my-warnings-view-model'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('My Warnings')

export default async function MyWarningsPage() {
  const t = await getTranslations()
  await requireCurrentUser()
  const warnings = projectMyWarnings((await getMyWarnings()).warnings)

  return (
    <div
      className='space-y-6'
      data-pw='my-warnings-page'
    >
      <SettingsPageHeader
        title={t('extracted.warnings.page.myWarnings_803cd934')}
        description={t('extracted.warnings.page.warningsIssuedToYourAccountByModerators_d6e7f809')}
      />
      <MyWarningsClient warnings={warnings} />
    </div>
  )
}
